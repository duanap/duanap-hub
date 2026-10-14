"""Full theme + installed OAuth SDK, with private synthetic external transport."""
import argparse,base64,concurrent.futures,hashlib,http.cookiejar,json,pathlib,re,secrets,subprocess,threading,urllib.error,urllib.parse,urllib.request
parser=argparse.ArgumentParser();parser.add_argument('--config',required=True);parser.add_argument('--wp-root',required=True);parser.add_argument('--php',default='php');args=parser.parse_args()
config=json.loads(pathlib.Path(args.config).read_text());base=config['home']
if urllib.parse.urlparse(base).hostname!='127.0.0.1':raise SystemExit('Isolated loopback required')
verify=subprocess.run([args.php,str(pathlib.Path(__file__).with_name('fixture.php')),args.wp_root,'verify','0'],capture_output=True,text=True,check=True)
if json.loads(verify.stdout)['home']!=base:raise SystemExit('Fixture home mismatch')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None
def context():return urllib.request.build_opener(NoRedirect,urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(client,path,body=None,headers=None):
    data=urllib.parse.urlencode(body).encode() if body is not None else None
    try:r=client.open(urllib.request.Request(base+path,data=data,headers=headers or {}),timeout=20)
    except urllib.error.HTTPError as e:r=e
    text=r.read().decode(errors='replace');return r.status,r.headers,text
checks=[]
def check(name,condition):
    if not condition:raise AssertionError(name)
    checks.append(name)
def begin(client,provider='qq',nonce=None):
    status,headers,text=request(client,'/oauth/'+provider+('/?_hub_nonce='+urllib.parse.quote(nonce) if nonce else '/'))
    if status!=302:return status,None
    return status,urllib.parse.parse_qs(urllib.parse.urlparse(headers.get('Location','')).query).get('state',[''])[0]
def callback(client,state,code,provider='qq'):
    return request(client,'/oauth/'+provider+'/callback/?'+urllib.parse.urlencode({'state':state,'code':code}))
code='fixture_'+secrets.token_hex(12)
alice=context();status,state=begin(alice);check('native URL delegates protected authorization',status==302 and bool(re.fullmatch('[0-9a-f]{64}',state or '')))
status,headers,text=callback(alice,'0'*64,code);check('forged state refused',status==400)
foreign=context();status,headers,text=callback(foreign,state,code);check('other browser state refused',status==400)
status,headers,text=callback(alice,state,code)
if status!=302:
    try:failure=json.loads(text)
    except Exception:failure={}
    print(json.dumps({'callbackStatus':status,'contentType':headers.get('Content-Type'),'errorCode':failure.get('error'),'errorDescription':str(failure.get('error_description',''))[:160],'invalidCallback':'授权回调无效' in text,'invalidSubject':'身份格式无效' in text,'bodyHasExpired':'失效' in text}))
check('installed SDK callback succeeds',status==302 and '/hub-account-bindings' in headers.get('Location',''))
status,headers,text=callback(alice,state,code);check('callback state consumes once',status==400)
status,headers,manager=request(alice,'/hub-account-bindings');check('authoritative manager available',status==200 and '账号绑定与恢复' in manager)
check('manager is private','no-store' in headers.get('Cache-Control','') and 'noindex' in headers.get('X-Robots-Tag',''))
uid=re.search(r'UID：([0-9a-f-]{36})',manager).group(1)
status,headers,text=request(alice,'/hub-account-bindings?expect_uid=00000000-0000-4000-8000-000000000000')
check('different Hub and blog accounts cannot manage bindings',status==403)
verifier=secrets.token_urlsafe(40)
params={'client_id':config['clientId'],'redirect_uri':config['callback'],'response_type':'code','scope':'basic','state':secrets.token_urlsafe(24),'code_challenge_method':'S256','code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
status,headers,text=request(alice,'/oauth/authorize/?'+urllib.parse.urlencode(params))
grant=urllib.parse.parse_qs(urllib.parse.urlparse(headers.get('Location','')).query).get('code',[''])[0]
check('social session authorizes dedicated Hub client',status==302 and bool(grant))
status,headers,text=request(context(),'/oauth/token/',{'grant_type':'authorization_code','code':grant,'code_verifier':verifier,'client_id':config['clientId'],'client_secret':config['clientSecret'],'redirect_uri':config['callback']})
token=json.loads(text).get('access_token','');check('social authorization exchanges with PKCE',status==200 and bool(token))
status,headers,text=request(context(),'/wp-json/duanap-hub/v1/me/bindings',headers={'Authorization':'Bearer '+token})
binding=json.loads(text)
check('real Bridge binding API is private and minimal',status==200 and 'no-store' in headers.get('Cache-Control','') and set(binding)=={'providers','password_ready','management_url','recovery_url','as_of'} and binding['providers'][0]['linked'] is True)
status,headers,text=request(context(),'/wp-json/duanap-hub/v1/me/bindings')
check('real Bridge bindings reject anonymous caller',status==401)
nonce=re.search(r'name="_wpnonce" value="([^"]+)"',manager)
check('manager has nonce',bool(nonce))
status,headers,text=request(alice,'/hub-account-bindings',{'provider':'qq','_wpnonce':nonce.group(1)})
check('last social-only login cannot be removed','不能解绑最后一种' in text)
status,headers,text=request(alice,'/hub-account-bindings',{'provider':'qq','_wpnonce':'forged'})
check('unlink CSRF refused',status==403)
status,headers,text=request(alice,'/hub-account-bindings')
link=re.search(r'href="([^"]*/oauth/github[^\"]*)"',text)
check('manager issues signed bind link',bool(link))
bind_url=link.group(1).replace('&amp;','&')
relative=urllib.parse.urlparse(bind_url);status,state=begin(alice,'github',urllib.parse.parse_qs(relative.query)['_hub_nonce'][0]);check('recent actor can begin binding',status==302)
github_code='fixture_'+secrets.token_hex(12)
status,headers,text=callback(alice,state,github_code,'github');check('GitHub binds into same actor',status==302)
status,headers,text=request(alice,'/hub-account-bindings');check('second platform shown linked','GitHub' in text and text.count('已绑定')>=2)
github_login=context();status,state=begin(github_login,'github');status,headers,text=callback(github_login,state,github_code,'github')
check('GitHub identity logs into same account',status==302 and uid in request(github_login,'/hub-account-bindings')[2])
# Always read the signed link from the current authoritative manager.
manager=request(alice,'/hub-account-bindings')[2]
link=re.search(r'href="([^\"]*/oauth/gitee[^\"]*)"',manager)
gitee_nonce=urllib.parse.parse_qs(urllib.parse.urlparse(link.group(1).replace('&amp;','&')).query)['_hub_nonce'][0]
status,state=begin(alice,'gitee',gitee_nonce);gitee_code='fixture_'+secrets.token_hex(12)
status,headers,text=callback(alice,state,gitee_code,'gitee')
check('installed Gitee SDK binds same account',status==302 and uid in request(alice,'/hub-account-bindings')[2])
gitee_login=context();status,state=begin(gitee_login,'gitee');status,headers,text=callback(gitee_login,state,gitee_code,'gitee')
check('Gitee identity logs into same account',status==302 and uid in request(gitee_login,'/hub-account-bindings')[2])
manager=request(alice,'/hub-account-bindings')[2];nonce=re.search(r'name="_wpnonce" value="([^\"]+)"',manager).group(1)
status,headers,text=request(alice,'/hub-account-bindings',{'provider':'gitee','_wpnonce':nonce});check('Gitee unbind preserves other methods','已解除绑定' in text)
status,headers,text=request(alice,'/hub-account-bindings')
nonce=re.search(r'name="_wpnonce" value="([^"]+)"',text).group(1)
status,headers,text=request(alice,'/hub-account-bindings',{'provider':'github','_wpnonce':nonce});check('other method allows unlink','已解除绑定' in text)
status,headers,text=request(alice,'/hub-account-bindings');nonce=re.search(r'name="_wpnonce" value="([^"]+)"',text).group(1)
status,headers,text=request(alice,'/hub-account-bindings',{'provider':'qq','_wpnonce':nonce});check('last-method guard remains after unlink','不能解绑最后一种' in text)
# Two independent callback sessions with the same synthetic identity.
code='fixture_'+secrets.token_hex(12)
clients=[context() for _ in range(8)];states=[begin(c)[1] for c in clients];barrier=threading.Barrier(8)
def exchange(pair):
    client,state=pair;barrier.wait();return callback(client,state,code)[0]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:statuses=list(pool.map(exchange,zip(clients,states)))
check('eight repeated identity callbacks succeed safely',all(s==302 for s in statuses))
counts=subprocess.run([args.php,str(pathlib.Path(__file__).with_name('fixture.php')),args.wp_root,'social-count','0',code],capture_output=True,text=True,check=True)
counts=json.loads(counts.stdout)
check('parallel first authorization creates one user mapping',counts['claims']==1 and counts['nativeOwners']==1)
print(json.dumps({'passed':len(checks),'checks':checks,'fullTheme':True,'installedSdk':True,'externalTransport':'synthetic','productionDataUsed':False}))
