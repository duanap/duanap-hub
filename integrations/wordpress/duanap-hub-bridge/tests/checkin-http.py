"""Actual native AJAX and Bearer API concurrency against a fresh full-theme fixture."""
import argparse,base64,concurrent.futures,hashlib,http.cookiejar,json,pathlib,re,secrets,subprocess,threading,urllib.error,urllib.parse,urllib.request
p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--wp-root',required=True);p.add_argument('--php',default='php');a=p.parse_args()
config=json.loads(pathlib.Path(a.config).read_text());base=config['home']
if urllib.parse.urlparse(base).hostname!='127.0.0.1':raise SystemExit('Loopback required')
verify=subprocess.run([a.php,str(pathlib.Path(__file__).with_name('fixture.php')),a.wp_root,'verify','0'],capture_output=True,text=True,check=True)
if json.loads(verify.stdout)['home']!=base:raise SystemExit('Marked fixture home mismatch')
def fixture(action,id=0):
    r=subprocess.run([a.php,str(pathlib.Path(__file__).with_name('checkin-fixture.php')),a.wp_root,action,str(id)],capture_output=True,text=True,check=True)
    return json.loads(r.stdout)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None
def context():return urllib.request.build_opener(NoRedirect,urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(client,path,body=None,token=None):
    headers={};data=None
    if token:headers['Authorization']='Bearer '+token
    if body is not None:
        if token:headers['Content-Type']='application/json';data=json.dumps(body).encode()
        else:data=urllib.parse.urlencode(body).encode()
    try:r=client.open(urllib.request.Request(base+path,data=data,headers=headers),timeout=20)
    except urllib.error.HTTPError as e:r=e
    raw=r.read().decode(errors='replace')
    try:payload=json.loads(raw)
    except Exception:payload=None
    return r.status,r.headers,payload,raw
checks=[]
def check(name,ok):
    if not ok:raise AssertionError(name)
    checks.append(name)
def login(user):
    c=context();request(c,'/wp-login.php');s,h,j,t=request(c,'/wp-login.php',{'log':user['username'],'pwd':user['password'],'redirect_to':base+'/', 'testcookie':'1'})
    if s!=302:raise AssertionError('synthetic login')
    s,h,j,t=request(c,'/');match=re.search(r'id="duanap-hub-checkin-config">([^<]+)',t)
    if not match:raise AssertionError('native button nonce adapter')
    return c,json.loads(match.group(1))['nonce']
def authorize(c):
    verifier=secrets.token_urlsafe(40)
    params={'client_id':config['clientId'],'redirect_uri':config['callback'],'response_type':'code','scope':'basic','state':secrets.token_urlsafe(24),'code_challenge_method':'S256','code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
    s,h,j,t=request(c,'/oauth/authorize/?'+urllib.parse.urlencode(params));code=urllib.parse.parse_qs(urllib.parse.urlparse(h.get('Location','')).query).get('code',[''])[0]
    if not code:raise AssertionError('authorization')
    # Token endpoint uses form credentials, not an API Bearer token.
    s,h,j,t=request(context(),'/oauth/token/',{'grant_type':'authorization_code','client_id':config['clientId'],'client_secret':config['clientSecret'],'redirect_uri':config['callback'],'code':code,'code_verifier':verifier})
    if s!=200 or not j.get('access_token'):raise AssertionError('token exchange')
    return j['access_token']
user=fixture('create');clients=[login(user) for _ in range(4)];token=authorize(clients[0][0]);api=context()
s,h,j,t=request(api,'/wp-json/duanap-hub/v1/me/checkin',token=token);date=j['business_date']
check('native and API share server business date',s==200 and j['checked_in'] is False)
s,h,j,t=request(clients[0][0],'/wp-admin/admin-ajax.php',{'action':'user_checkin','_wpnonce':'forged'})
check('native button rejects missing proof',j and bool(j.get('error')))
holder=subprocess.Popen([a.php,str(pathlib.Path(__file__).with_name('checkin-fixture.php')),a.wp_root,'hold',str(user['id'])],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    if holder.stdout.readline().strip()!='ready':raise AssertionError('Fixture lock acquisition')
    s,h,j,t=request(clients[0][0],'/wp-admin/admin-ajax.php',{'action':'user_checkin','_wpnonce':clients[0][1]})
    check('pending native reply cannot replace button with completed details',j and j.get('data',{}).get('status')=='processing' and not j.get('details_link'))
finally:holder.communicate(timeout=10)
barrier=threading.Barrier(8)
def sign(i):
    barrier.wait()
    if i<4:
        c,nonce=clients[i];s,h,j,t=request(c,'/wp-admin/admin-ajax.php',{'action':'user_checkin','_wpnonce':nonce});return j.get('data',{})
    s,h,j,t=request(context(),'/wp-json/duanap-hub/v1/me/checkin',{'business_date':date,'request_id':secrets.token_hex(16)},token);return j
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:results=list(pool.map(sign,range(8)))
check('mixed native/API callbacks have one success',sum(r.get('status')=='success' for r in results)==1 and all(r.get('status') in ['success','already','processing'] for r in results))
check('one award, history item, counter and event',fixture('snapshot',user['id'])=={'balance':105,'total':1,'continuous':1,'records':1,'events':1})
s,h,j,t=request(api,'/wp-json/duanap-hub/v1/me/checkin',{'business_date':date,'request_id':secrets.token_hex(16)},token);receipt=j['receipt']
check('different request ID replays stable receipt',j['status']=='already' and j['balance']==105)
s,h,j,t=request(api,'/wp-json/duanap-hub/v1/me/checkin/result?business_date='+date,token=token)
check('lost response recovered by result query',s==200 and j['receipt']==receipt and 'no-store' in h.get('Cache-Control',''))
s,h,j,t=request(api,'/wp-json/duanap-hub/v1/me/checkin/result?business_date='+date+'&user_id=1',token=token);check('result identity override refused',s==400)
other=fixture('create');c,n=login(other);other_token=authorize(c)
s,h,j,t=request(context(),'/wp-json/duanap-hub/v1/me/checkin/result?business_date='+date,token=other_token);check('other account cannot read receipt',s==200 and j['status']=='not_recorded' and 'receipt' not in j)
fixture('point-fault',other['id'])
try:
    s,h,j,t=request(context(),'/wp-json/duanap-hub/v1/me/checkin',{'business_date':date},other_token)
    check('ignored native SQL failure fails closed',s==503 and 'Synthetic daily point failure' not in t)
    observed=fixture('snapshot',other['id'])
    check('point write failure rolls back native counters and receipt',observed=={'balance':100,'total':0,'continuous':0,'records':0,'events':0})
finally:fixture('clear-fault',other['id'])
s,h,j,t=request(context(),'/wp-json/duanap-hub/v1/me/checkin',{'business_date':date,'source':'blog'},other_token);check('retry after point rollback awards once',s==200 and j['balance']==105)
check('trusted API source ignores caller spoof',fixture('sources',other['id'])==['hub'])
print(json.dumps({'passed':len(checks),'checks':checks,'mixedParallelRequests':8,'fullTheme':True,'productionDataUsed':False}))
