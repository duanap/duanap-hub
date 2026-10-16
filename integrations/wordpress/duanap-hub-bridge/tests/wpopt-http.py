"""HTTP acceptance on a restored fixture with WPOPT; private synthetic config only."""
import argparse,importlib.util,json,os,pathlib,socket,subprocess,time,urllib.request
spec=importlib.util.spec_from_file_location('recovery_support',pathlib.Path(__file__).with_name('recovery-support.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
p=argparse.ArgumentParser();p.add_argument('--wp-root',required=True);p.add_argument('--php',default='php');p.add_argument('--config',required=True);p.add_argument('--cache-profile',action='store_true');p.add_argument('--cache-marker')
p.add_argument('--suite',action='append',choices=['integration.py','oauth.py','social-http.py','checkin-http.py','login-reward-http.py'])
args=p.parse_args();os.umask(0o077);root=support.fixture_root(args.wp_root)
support.assert_offline();support.preflight(root,args.php)
config=pathlib.Path(args.config).absolute();value=json.loads(config.read_text())
if value.get('home')!='http://127.0.0.1:1030' or not all(key in value for key in ['alice','bob','clientId','clientSecret','callback']):raise SystemExit('Explicit synthetic loopback configuration required')
if not (root.parent/'wpopt-result.json').is_file():raise SystemExit('Validated WPOPT restore required')
if (root/'wp-content/object-cache.php').exists():
    if not args.cache_profile or not args.cache_marker:raise SystemExit('Persistent cache requires explicit private profile validation')
    validated=subprocess.run([args.php,str(pathlib.Path(__file__).with_name('cache-profile.php')),str(root),'validate',args.cache_marker],capture_output=True)
    if validated.returncode:raise SystemExit('Private Redis profile validation failed')
elif args.cache_profile:raise SystemExit('Expected private Redis drop-in is missing')
try:
    connection=socket.create_connection(('127.0.0.1',1030),timeout=1);connection.close()
except OSError:pass
else:raise SystemExit('Fixture port already in use; leave existing process untouched')
sessions=root.parent/'http-sessions';sessions.mkdir(mode=0o700,exist_ok=True)
if sessions.is_symlink() or sessions.resolve()!=sessions:raise SystemExit('Private real session directory required')
tests=pathlib.Path(__file__).parent;unit='duanap-p2-wpopt-audit'
subprocess.run(['systemd-run','--unit='+unit,'--collect','--property=NoNewPrivileges=true','--property=ProtectSystem=strict',
 '--property=MemoryMax=512M','--property=CPUQuota=100%','--property=IPAddressDeny=any','--property=IPAddressAllow=localhost',
 '--property=StandardOutput=null','--property=StandardError=null',
 '--property=ReadWritePaths='+str(root/'wp-content')+' '+str(sessions),'--working-directory='+str(root),
 '--setenv=PHP_CLI_SERVER_WORKERS=4',args.php,'-d','opcache.enable=0','-d','opcache.enable_cli=0',
 '-d','session.save_path='+str(sessions),'-S','127.0.0.1:1030','-t',str(root),str(root/'router.php')],check=True,capture_output=True)
results=[]
try:
    ready=False
    for _ in range(40):
        try:urllib.request.urlopen(value['home'],timeout=1).close();ready=True;break
        except Exception:time.sleep(.2)
    if not ready:raise RuntimeError('Offline fixture did not become healthy')
    for file in args.suite or ['integration.py','oauth.py','social-http.py','checkin-http.py','login-reward-http.py']:
        command=['python3',str(tests/file),'--config',str(config),'--wp-root',str(root),'--php',args.php]
        r=subprocess.run(command,capture_output=True,text=True,timeout=180)
        log=root.parent/('wpopt-'+file+'.log');log.write_text(r.stdout+'\n'+r.stderr);log.chmod(0o600)
        if r.returncode:raise RuntimeError('HTTP combination failed '+file+'; details retained privately')
        result=json.loads(r.stdout);results.append({'suite':file,'passed':result['passed']})
finally:subprocess.run(['systemctl','stop',unit+'.service'],check=True)
report={'passed':sum(result['passed'] for result in results),'suites':results,'cacheProfile':args.cache_profile,'syntheticTransport':True,'productionChanged':False,'fixtureServiceStopped':True}
file=root.parent/'wpopt-http-result.json';file.write_text(json.dumps(report));file.chmod(0o600)
print(json.dumps(report))
