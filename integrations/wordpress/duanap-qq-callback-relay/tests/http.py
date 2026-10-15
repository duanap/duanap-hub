"""Run on the server against the marked loopback-only WordPress fixture."""
import http.cookiejar, json, pathlib, sys, urllib.error, urllib.parse, urllib.request

root = pathlib.Path('/www/wwwroot/duanap-hub/shared/p2-sandbox-20261014/wordpress')
if (root/'duanap-hub-fixture.marker').read_text().strip() != 'isolated':
    raise SystemExit('Isolated fixture required')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args): return None
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(jar))
mode = sys.argv[1] if len(sys.argv)>1 else 'relay'
if mode not in ['native','relay']: raise SystemExit('Invalid fixture mode')
def get(path):
    try: return client.open('http://127.0.0.1:1030'+path, timeout=15)
    except urllib.error.HTTPError as response: return response
checks = []
def check(name, passed):
    if not passed: raise RuntimeError(name)
    checks.append(name)

response = get('/oauth/qq')
target = urllib.parse.urlparse(response.headers.get('Location', ''))
query = urllib.parse.parse_qs(target.query)
check('native authorize targets Tencent', response.code in [302,303] and target.hostname == 'graph.qq.com')
expected='https://audit.invalid/oauth/qq/callback' if mode=='relay' else 'http://127.0.0.1:1030/oauth/qq/callback'
check('native authorize uses the intended application callback', query.get('redirect_uri') == [expected])
check('native authorize creates original PHP session', any(cookie.name == 'PHPSESSID' for cookie in jar))
for path in ['/oauth/qq/callback', '/oauth/qq/callback?'+urllib.parse.urlencode({'code':'fixture_authorization_code_12345678','state':'z'*32})]:
    response = get(path)
    check('native callback is private', 'no-store' in response.headers.get('Cache-Control',''))
    check('native callback suppresses referrer', response.headers.get('Referrer-Policy') == 'no-referrer')
    check('invalid callback grants no WordPress login', not any(cookie.name.startswith('wordpress_logged_in_') for cookie in jar))
print(json.dumps({'mode':mode,'passed':len(checks),'checks':checks,'realTencentAuthorization':False}))
