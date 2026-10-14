"""Run only against the explicit private development fixture; never print tokens."""
import argparse, base64, concurrent.futures, hashlib, http.cookiejar, json, pathlib, secrets, subprocess, urllib.error, urllib.parse, urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--config', required=True, help='Private fixture credentials JSON, outside the checkout')
parser.add_argument('--anonymous-only', action='store_true')
parser.add_argument('--wp-root', required=False, help='Explicit marked synthetic WP fixture, for lifecycle checks')
parser.add_argument('--php', default='php')
args = parser.parse_args()
with open(args.config, encoding='utf-8') as handle: config = json.load(handle)
base = config['home']
if urllib.parse.urlparse(base).hostname not in ['127.0.0.1', 'localhost']:
    raise SystemExit('Integration tests require an isolated loopback fixture')

def fixture(action,uid,extra=None):
    command=[args.php,str(pathlib.Path(__file__).with_name('fixture.php')),args.wp_root,action,str(uid)]
    if extra: command.append(extra)
    result=subprocess.run(command,capture_output=True,text=True,check=True)
    return json.loads(result.stdout)

if not args.anonymous_only:
    if not args.wp_root: raise SystemExit('--wp-root is required for authenticated fixture tests')
    if fixture('verify',0)['home'] != base: raise SystemExit('Fixture root and HTTP home must match')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None

def context(): return urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(opener, path, method='GET', body=None, token=None, headers=None):
    values = dict(headers or {})
    if token: values['Authorization'] = 'Bearer '+token
    data = urllib.parse.urlencode(body).encode() if body is not None else None
    req = urllib.request.Request(base+path, data=data, method=method, headers=values)
    try: response = opener.open(req, timeout=15)
    except urllib.error.HTTPError as error: response = error
    raw = response.read()
    try: payload = json.loads(raw)
    except Exception: payload = None
    return response.status, response.headers, payload

passed=[]
def check(name, condition):
    if not condition: raise AssertionError(name)
    passed.append(name)

anonymous=context()
for path in ['/me','/me/points','/me/checkin','/me/points/history']:
    status,headers,data=request(anonymous, '/wp-json/duanap-hub/v1'+path)
    check('anonymous denied: '+path, status==401)
    check('private response: '+path, 'no-store' in headers.get('Cache-Control','') and 'private' in headers.get('Cache-Control',''))
if args.anonymous_only:
    print(json.dumps({'passed':len(passed),'checks':passed})); raise SystemExit(0)

def login_token(user, client=None):
    opener=context()
    request(opener,'/wp-login.php')
    status,headers,data=request(opener,'/wp-login.php','POST',{'log':user['username'],'pwd':user['password'],'wp-submit':'Log In','redirect_to':base+'/','testcookie':'1'})
    check('fixture login',status==302)
    client=client or {'id':config['clientId'],'secret':config['clientSecret']}
    verifier=secrets.token_urlsafe(40)
    state=secrets.token_urlsafe(24)
    challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    params={'client_id':client['id'],'redirect_uri':config['callback'],'response_type':'code','scope':'basic','state':state,'code_challenge':challenge,'code_challenge_method':'S256'}
    status,headers,data=request(opener,'/oauth/authorize/?'+urllib.parse.urlencode(params))
    query=urllib.parse.parse_qs(urllib.parse.urlparse(headers.get('Location','')).query)
    check('fixture authorization',status==302 and query.get('state')==[state] and bool(query.get('code')))
    status,headers,data=request(opener,'/oauth/token/','POST',{'grant_type':'authorization_code','code':query['code'][0],'code_verifier':verifier,'client_id':client['id'],'client_secret':client['secret'],'redirect_uri':config['callback']})
    check('fixture token',status==200 and bool(data.get('access_token')))
    return opener,data['access_token']

alice,alice_token=login_token(config['alice'])
bob,bob_token=login_token(config['bob'])
def get(opener,path,token):
    status,headers,data=request(opener,'/wp-json/duanap-hub/v1'+path,token=token)
    check('authenticated read: '+path,status==200)
    check('authenticated no-store: '+path,'private' in headers.get('Cache-Control','') and 'no-store' in headers.get('Cache-Control',''))
    return data
alice_me=get(alice,'/me',alice_token)
bob_me=get(bob,'/me',bob_token)
check('stable UUID identity', isinstance(alice_me.get('hub_uid'),str) and len(alice_me['hub_uid'])==36 and alice_me['hub_uid']==get(alice,'/me',alice_token)['hub_uid'])
check('distinct user identities',alice_me['hub_uid']!=bob_me['hub_uid'])
check('minimal identity fields',set(alice_me)=={'hub_uid','display_name','avatar_url','as_of'})
check('Alice points isolated',get(alice,'/me/points',alice_token)['balance']==100)
check('Bob points isolated',get(bob,'/me/points',bob_token)['balance']==200)
checkin=get(alice,'/me/checkin',alice_token)
check('Beijing checked-in state',checkin['checked_in'] is True and checkin['timezone']=='Asia/Shanghai' and checkin['continuous_days']==3)
check('Bob not signed in',get(bob,'/me/checkin',bob_token)['checked_in'] is False)
history=get(alice,'/me/points/history?per_page=1',alice_token)
check('history bounded and structured',len(history['items'])==1 and history['items'][0]['delta']==5 and history['retention_limit']==50)
check('history has no private/internal fields',set(history['items'][0])=={'delta','balance_after','reason','occurred_at'})
status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me?user_id='+str(config['bob']['id']),token=alice_token)
check('client identity override refused',status==400)
status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me',token='invalid-token')
check('invalid token refused',status==401)
status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me?access_token='+alice_token)
check('URL tokens refused',status==401)
status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me/checkin','POST',{},token=alice_token)
check('missing date cannot write checkin',status in [400,503])
status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me/points/history?per_page=500',token=alice_token)
check('pagination bounded',status==400)
other,other_token=login_token(config['alice'],config['otherClient'])
status,headers,data=request(other,'/wp-json/duanap-hub/v1/me',token=other_token)
check('other OAuth client refused',status==403)
if args.wp_root:
    fixture('ban',config['bob']['id'])
    try:
        status,headers,data=request(bob,'/wp-json/duanap-hub/v1/me',token=bob_token)
        check('banned user refused',status==403)
        fixture('expired-ban',config['bob']['id'])
        get(bob,'/me',bob_token)
        check('expired ban read has no unban side effect',str(fixture('state',config['bob']['id'])['banned'])=='1')
    finally: fixture('clear-ban',config['bob']['id'])
    fixture('bad-history',config['alice']['id'])
    try:
        status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me/points/history',token=alice_token)
        check('malformed history is not reported as zero',status==503)
    finally: fixture('fix-history',config['alice']['id'])
    fixture('bad-balance',config['alice']['id'])
    try:
        status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me/points',token=alice_token)
        check('malformed balance is not reported as zero',status==503)
    finally: fixture('fix-balance',config['alice']['id'])
    fresh=fixture('create',0)
    member,member_token=login_token(fresh)
    def identity_read(_):
        status,headers,data=request(context(),'/wp-json/duanap-hub/v1/me',token=member_token)
        return status,data.get('hub_uid') if isinstance(data,dict) else None
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: identities=list(pool.map(identity_read,range(8)))
    check('parallel first access creates one UID',all(status==200 for status,uid in identities) and len({uid for status,uid in identities})==1)
    retired_uid=identities[0][1]
    fixture('delete',fresh['id'])
    status,headers,data=request(member,'/wp-json/duanap-hub/v1/me',token=member_token)
    check('deleted user token cannot read',status==403)
    check('UID tombstone retained',int(fixture('retired',fresh['id'],retired_uid)['retired'])==1)
    check('allocator rejects nonexistent user',fixture('allocate-missing',fresh['id'])['rejected'] is True)
    check('existing point balances unchanged',int(fixture('state',config['alice']['id'])['balance'])==100 and int(fixture('state',config['bob']['id'])['balance'])==200)
    fixture('unsupported-theme',config['alice']['id'])
    try:
        status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me/points',token=alice_token)
        check('unsupported theme returns unavailable',status==503)
    finally:fixture('restore-theme',config['alice']['id'])
    fixture('disable-provider',config['alice']['id'])
    try:
        status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me',token=alice_token)
        check('disabled provider returns unavailable',status==503)
    finally:fixture('restore-provider',config['alice']['id'])
status,headers,data=request(alice,'/oauth/revoke/','POST',{'token':alice_token,'token_type_hint':'access_token','client_id':config['clientId'],'client_secret':config['clientSecret']})
check('revoke fixture token',status==200)
status,headers,data=request(alice,'/wp-json/duanap-hub/v1/me',token=alice_token)
check('revoked session refused',status==401)
print(json.dumps({'passed':len(passed),'checks':passed,'productionDataUsed':False}))
