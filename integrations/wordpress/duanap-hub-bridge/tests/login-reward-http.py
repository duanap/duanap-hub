"""Native admin_init rewards must share the checkin user lock and rollback."""
import argparse,base64,concurrent.futures,hashlib,http.cookiejar,json,pathlib,re,secrets,subprocess,threading,urllib.request,urllib.error,urllib.parse
p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--wp-root',required=True);p.add_argument('--php',default='php');a=p.parse_args()
config=json.loads(pathlib.Path(a.config).read_text());base=config['home']
if base!='http://127.0.0.1:1030':raise SystemExit('Isolated loopback required')
def fixture(action,id=0):
    r=subprocess.run([a.php,str(pathlib.Path(__file__).with_name('checkin-fixture.php')),a.wp_root,action,str(id)],capture_output=True,text=True,check=True)
    return json.loads(r.stdout)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
def client():return urllib.request.build_opener(NoRedirect,urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(c,path,body=None,token=None):
    headers={'Authorization':'Bearer '+token} if token else {}
    data=(json.dumps(body).encode() if token else urllib.parse.urlencode(body).encode()) if body is not None else None
    if token and body is not None:headers['Content-Type']='application/json'
    try:r=c.open(urllib.request.Request(base+path,data=data,headers=headers),timeout=20)
    except urllib.error.HTTPError as e:r=e
    return r.status,r.read()
def login(user):
    c=client();request(c,'/wp-login.php');s,_=request(c,'/wp-login.php',{'log':user['username'],'pwd':user['password'],'redirect_to':base+'/','testcookie':'1'})
    if s!=302:raise AssertionError('Synthetic authentication')
    return c
checks=[]
def check(name,ok):
    if not ok:raise AssertionError(name)
    checks.append(name)
fixture('login-policy-on')
try:
    user=fixture('create');before=fixture('login-snapshot',user['id']);clients=[login(user) for _ in range(8)];barrier=threading.Barrier(8)
    def probe(c):barrier.wait();return request(c,'/wp-admin/admin-ajax.php',{'action':'hub_fixture_nonexistent_action'})[0]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:statuses=list(pool.map(probe,clients))
    after=fixture('login-snapshot',user['id'])
    check('native admin requests retain their normal response',all(s==400 for s in statuses))
    check('eight first admin requests grant native login points once',after['balance']==before['balance']+5)
    check('native login integral is granted once',after['integral']==before['integral']+3)
    check('login reward retains existing history',after['records']==before['records']+1)
    request(clients[0],'/wp-admin/admin-ajax.php',{'action':'hub_fixture_nonexistent_action'})
    check('subsequent admin request does not award again',fixture('login-snapshot',user['id'])==after)
    bad=fixture('create');before=fixture('login-snapshot',bad['id']);c=login(bad);fixture('login-fault',bad['id'])
    try:
        status,_=request(c,'/wp-admin/admin-ajax.php',{'action':'hub_fixture_nonexistent_action'})
        check('native login reward SQL failure is explicit',status==503)
        check('failed login reward rolls back both flags balances and history',fixture('login-snapshot',bad['id'])==before)
    finally:fixture('login-clear-fault',bad['id'])
    request(c,'/wp-admin/admin-ajax.php',{'action':'hub_fixture_nonexistent_action'});after=fixture('login-snapshot',bad['id'])
    check('retry after rollback grants each original reward once',after['balance']==before['balance']+5 and after['integral']==before['integral']+3)
    fixture('login-checkin-off')
    try:
        disabled=fixture('create');c=login(disabled);before=fixture('login-snapshot',disabled['id']);s,_=request(c,'/wp-admin/admin-ajax.php',{'action':'hub_fixture_nonexistent_action'})
        check('disabling optional checkin does not lock out blog admin requests',s==400)
        check('native login reward remains independent of checkin setting',fixture('login-snapshot',disabled['id'])['balance']==before['balance']+5)
    finally:fixture('login-checkin-on')
    mixed=fixture('create');native=[login(mixed) for _ in range(4)];before=fixture('login-snapshot',mixed['id'])
    verifier=secrets.token_urlsafe(40)
    params={'client_id':config['clientId'],'redirect_uri':config['callback'],'response_type':'code','scope':'basic','state':secrets.token_urlsafe(32),'code_challenge_method':'S256','code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
    # Capture the one-use authorization redirect without following its callback.
    try:r=native[0].open(base+'/oauth/authorize/?'+urllib.parse.urlencode(params),timeout=20)
    except urllib.error.HTTPError as e:r=e
    code=urllib.parse.parse_qs(urllib.parse.urlparse(r.headers.get('Location','')).query).get('code',[''])[0];r.read()
    s,body=request(client(),'/oauth/token/',{'grant_type':'authorization_code','code':code,'code_verifier':verifier,'client_id':config['clientId'],'client_secret':config['clientSecret'],'redirect_uri':config['callback']});token=json.loads(body)['access_token']
    s,body=request(client(),'/wp-json/duanap-hub/v1/me/checkin',token=token);date=json.loads(body)['business_date']
    nonces=[]
    for c in native:
        _,page=request(c,'/');nonces.append(json.loads(re.search(rb'id="duanap-hub-checkin-config">([^<]+)',page).group(1))['nonce'])
    check('mixed setup has not pre-granted native login rewards',fixture('login-snapshot',mixed['id'])==before)
    barrier=threading.Barrier(8)
    def sign(i):
        barrier.wait()
        if i<4:
            status,body=request(native[i],'/wp-admin/admin-ajax.php',{'action':'user_checkin','_wpnonce':nonces[i]});value=json.loads(body).get('data',{})
        else:status,body=request(client(),'/wp-json/duanap-hub/v1/me/checkin',{'business_date':date},token);value=json.loads(body)
        return status,value.get('status')
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(sign,range(8)))
    if not all(s in [200,202] and v in ['success','already','processing'] for s,v in results):print(json.dumps({'mixedStatusOnly':results}))
    check('login rewards and eight mixed checkin requests complete safely',all(s in [200,202] and v in ['success','already','processing'] for s,v in results))
    check('mixed requests commit exactly one checkin',sum(v=='success' for s,v in results)==1)
    after=fixture('login-snapshot',mixed['id']);snapshot=fixture('snapshot',mixed['id'])
    check('native login and checkin rewards are both retained once',after['balance']==before['balance']+10 and after['records']==before['records']+2 and snapshot['events']==1 and snapshot['total']==1)
finally:fixture('login-policy-off')
print(json.dumps({'passed':len(checks),'checks':checks,'nativeParallelRequests':8,'productionDataUsed':False}))
