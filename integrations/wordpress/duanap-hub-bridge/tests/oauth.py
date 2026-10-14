"""OAuth regressions against a marked synthetic loopback fixture only."""
import argparse, base64, concurrent.futures, hashlib, http.cookiejar, json, pathlib, secrets, subprocess, threading, urllib.error, urllib.parse, urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--config', required=True)
parser.add_argument('--wp-root', required=True)
parser.add_argument('--php', default='php')
args = parser.parse_args()
config = json.loads(pathlib.Path(args.config).read_text())
base = config['home']
if urllib.parse.urlparse(base).hostname not in ['127.0.0.1', 'localhost']:
    raise SystemExit('An isolated loopback fixture is required')

def fixture(action, extra=None):
    cmd = [args.php, str(pathlib.Path(__file__).with_name('fixture.php')), args.wp_root, action, str(config['alice']['id'])]
    if extra is not None: cmd.append(extra)
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)

if fixture('verify')['home'] != base: raise SystemExit('Fixture root and HTTP home must match')
fixture('install')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None

def context(): return urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(opener, path, body=None, headers=None, encoding='form'):
    headers = dict(headers or {})
    if body is None: data = None
    elif encoding == 'json':
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    else: data = urllib.parse.urlencode(body).encode()
    try: result = opener.open(urllib.request.Request(base+path, data=data, headers=headers), timeout=20)
    except urllib.error.HTTPError as error: result = error
    raw = result.read()
    try: payload = json.loads(raw)
    except Exception: payload = {}
    return result.status, result.headers, payload

passed = []
def check(name, condition):
    if not condition: raise AssertionError(name)
    passed.append(name)

opener = context()
request(opener, '/wp-login.php')
status, headers, data = request(opener, '/wp-login.php', {'log':config['alice']['username'], 'pwd':config['alice']['password'], 'redirect_to':base+'/', 'testcookie':'1'})
check('synthetic login', status == 302)

def authorize(extra=None, body=None):
    verifier = secrets.token_urlsafe(40)
    params = {'client_id':config['clientId'], 'response_type':'code', 'redirect_uri':config['callback'], 'state':secrets.token_urlsafe(24), 'scope':'basic', 'code_challenge_method':'S256', 'code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
    params.update(extra or {})
    status, headers, data = request(opener, '/oauth/authorize/?'+urllib.parse.urlencode(params), body)
    values = urllib.parse.parse_qs(urllib.parse.urlparse(headers.get('Location','')).query)
    return status, values.get('code',[''])[0], verifier, headers

def token(code, verifier, encoding='form', basic=None, extra=None):
    body = {'grant_type':'authorization_code', 'code':code, 'code_verifier':verifier, 'redirect_uri':config['callback']}
    headers = {}
    if basic:
        headers['Authorization'] = basic+' '+base64.b64encode((config['clientId']+':'+config['clientSecret']).encode()).decode()
    else: body.update(client_id=config['clientId'], client_secret=config['clientSecret'])
    body.update(extra or {})
    return request(context(), '/oauth/token/', body, headers, encoding)

for label, extra in [('missing PKCE',{'code_challenge':''}), ('plain PKCE',{'code_challenge_method':'plain'}), ('missing state',{'state':''}), ('implicit',{'response_type':'token'}), ('wrong callback',{'redirect_uri':'https://other.invalid/callback'})]:
    status, code, verifier, headers = authorize(extra)
    check(label+' refused', status == 400 and not code)
status, code, verifier, headers = authorize({'code_challenge':''}, {'client_id':config['otherClient']['id']})
check('query/body client shadow cannot bypass PKCE', status == 400 and not code)
status, code, verifier, headers = authorize()
check('S256 authorization', status == 302 and bool(code))
for encoding, basic in [('json',None), ('form','basic')]:
    status, headers, data = token(code, '', encoding, basic)
    check(encoding+' '+str(basic)+' missing verifier refused', status == 400 and not data.get('access_token'))
status, headers, data = token(code, secrets.token_urlsafe(40), 'json')
check('wrong verifier refused', status == 400 and not data.get('access_token'))
status, headers, data = token(code, verifier, 'json')
if status != 200 or data.get('refresh_token'):
    print(json.dumps({'failedExchangeStatus':status,'fieldNames':list(data),'error':data.get('error')}))
check('JSON exchange and opaque bounded token', status == 200 and bool(data.get('access_token')) and not data.get('id_token') and not data.get('refresh_token') and 0 < data.get('expires_in',0) <= 3600)
check('token private cache', 'no-store' in headers.get('Cache-Control',''))
status, headers, data = token(code, verifier)
check('sequential replay refused', status == 400 and not data.get('access_token'))
status, code, verifier, headers = authorize()
status, headers, data = token(code, verifier, basic='basic')
check('lowercase Basic valid exchange', status == 200 and bool(data.get('access_token')))
for encoding in ['form','json']:
    status, headers, data = token('', secrets.token_urlsafe(40), encoding, extra={'grant_type':'password','username':config['alice']['username'],'password':config['alice']['password']})
    check(encoding+' password grant refused', status == 400 and not data.get('access_token'))

successes = []
for encoding in ['form', 'json', 'form']:
    status, code, verifier, headers = authorize()
    check('concurrency fresh code '+encoding, status == 302 and bool(code))
    barrier = threading.Barrier(8)
    def exchange(_):
        barrier.wait()
        status, headers, data = token(code, verifier, encoding)
        return status == 200 and bool(data.get('access_token'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: successes.append(sum(pool.map(exchange,range(8))))
    check('one consumer '+encoding, successes[-1] == 1)

status, code, verifier, headers = authorize()
fixture('fail-token-write')
try:
    status, headers, data = token(code, verifier)
    check('failed token INSERT fails closed', status == 503 and not data.get('access_token'))
finally: fixture('restore-token-write')
status, headers, data = token(code, verifier)
check('failed INSERT preserves authorization code', status == 200 and bool(data.get('access_token')))

status, code, verifier, headers = authorize()
before=fixture('oauth-counts')['tokens']
fixture('fail-code-delete')
try:
    status, headers, data = token(code, verifier)
    check('failed code DELETE fails closed', status == 503 and not data.get('access_token'))
    check('failed DELETE rolls back token INSERT', fixture('oauth-counts')['tokens'] == before)
finally: fixture('restore-code-delete')
status, headers, data = token(code, verifier)
check('failed DELETE preserves code for retry', status == 200 and bool(data.get('access_token')))

fixture('bad-callback')
try:
    status, code, verifier, headers = authorize()
    if status != 503: print(json.dumps({'invalidConfigStatus':status,'codePresent':bool(code)}))
    check('invalid callback configuration fails closed', status == 503 and not code)
finally: fixture('restore-callback')

fixture('missing-client')
try:
    status, code, verifier, headers = authorize()
    check('remembered Hub client fails closed when unconfigured', status == 503 and not code)
    params={'client_id':config['otherClient']['id'],'response_type':'code','redirect_uri':config['callback'],'state':secrets.token_urlsafe(24),'scope':'basic'}
    status, headers, data = request(opener,'/oauth/authorize/?'+urllib.parse.urlencode(params))
    values=urllib.parse.parse_qs(urllib.parse.urlparse(headers.get('Location','')).query)
    check('other client works with missing Hub config', status == 302 and bool(values.get('code')))
finally: fixture('restore-callback')

fixture('short-tokens')
try:
    status, code, verifier, headers = authorize()
    check('short token configuration refused before authorization', status == 503 and not code)
finally: fixture('restore-provider-options')

fixture('nontransactional-tokens')
try:
    status, code, verifier, headers = authorize()
    check('nontransactional storage fails closed', status == 503 and not code)
finally: fixture('restore-token-engine')
print(json.dumps({'passed':len(passed),'checks':passed,'parallelRequestsPerCode':8,'successfulExchanges':successes,'productionDataUsed':False}))
