"""Exercise real Redis while the unverified write gate remains closed."""
import argparse,hashlib,importlib.util,json,os,pathlib,secrets,shutil,subprocess,tempfile,time
spec=importlib.util.spec_from_file_location('recovery_support',pathlib.Path(__file__).with_name('recovery-support.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
p=argparse.ArgumentParser();p.add_argument('--wp-root',required=True);p.add_argument('--php',default='php');p.add_argument('--redis-plugin-source',required=True);p.add_argument('--profile',action='store_true');p.add_argument('--http-config')
args=p.parse_args();os.umask(0o077);root=support.fixture_root(args.wp_root)
if args.http_config and not args.profile:raise SystemExit('HTTP regression requires the explicit isolated profile')
support.assert_offline();support.preflight(root,args.php)
plugin=support.plugin_source(args.redis_plugin_source,'includes/object-cache.php')
target=root/'wp-content/plugins/redis-cache';dropin=root/'wp-content/object-cache.php';config=root/'wp-config.php'
if dropin.exists() or dropin.is_symlink():raise SystemExit('Do not replace an existing cache drop-in')
if target.exists():
    support.plugin_source(target,'includes/object-cache.php')
    def code_hashes(folder):return {str(p.relative_to(folder)):hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.rglob('*') if p.is_file() and '.git' not in p.parts and p.suffix!='.log'}
    if code_hashes(target)!=code_hashes(plugin):raise SystemExit('Existing fixture Redis code differs; leave it untouched')
else:shutil.copytree(plugin,target,ignore=shutil.ignore_patterns('*.log','.git'))
original=config.read_bytes();module=(target/'includes/object-cache.php').read_bytes()
if b'WP_REDIS_' in original:raise SystemExit('Do not replace existing Redis configuration')
marker=secrets.token_hex(16);results=[]
with tempfile.TemporaryDirectory(prefix='hub-p2-redis-') as directory:
    private=pathlib.Path(directory);socket=private/'cache.sock'
    with (private/'redis.log').open('wb') as output:
        redis=subprocess.Popen(['redis-server','--port','0','--save','','--appendonly','no','--unixsocket',str(socket),'--unixsocketperm','700','--dir',str(private),'--daemonize','no'],stdout=output,stderr=subprocess.STDOUT)
        modified=None
        try:
            for _ in range(80):
                if socket.exists():break
                if redis.poll() is not None:raise RuntimeError('Private Redis process failed to start')
                time.sleep(.05)
            if not socket.exists():raise RuntimeError('Private Redis socket unavailable')
            definitions="\ndefine('WP_REDIS_SCHEME','unix');\ndefine('WP_REDIS_PATH',"+json.dumps(str(socket))+\
                ");\ndefine('WP_REDIS_PREFIX','hub-p2-audit-"+marker+"');\ndefine('WP_REDIS_CLIENT','phpredis');\ndefine('WP_REDIS_DATABASE',0);\n"
            groups=['users','userlogins','useremail','userslugs','user_meta','zib_option_meta_data']
            cases=[('blocked',None)] if not args.profile else [('seed-stale',None),('external-flag-mismatch',None),('flag-off',groups),('unknown-profile',groups),*[(f'missing-{group}',[g for g in groups if g!=group]) for group in groups],('runtime-group-mismatch',groups),('runtime-only',None),('dropin-mismatch',groups),('unsupported-backend',groups),('good',groups)]
            dropin.write_bytes(module)
            for phase,ignored in cases:
                settings=definitions
                if ignored is not None:settings+="define('WP_REDIS_IGNORED_GROUPS',"+json.dumps(ignored)+");\n"
                if args.profile and phase not in ['flag-off','seed-stale','external-flag-mismatch']:settings+="define('DUANAP_HUB_CACHE_PROFILE',"+json.dumps('unknown' if phase=='unknown-profile' else 'redis-user-local-v1')+");\n"
                modified=original.replace(b'<?php',b'<?php'+settings.encode(),1)
                config.write_bytes(modified);config.chmod(0o600)
                if args.profile:
                    commands=[['cache-profile.php',phase]]
                else:commands=[['cache-fixture.php',p] for p in ['set','check','transaction']]
                for file,step in commands:
                    r=subprocess.run([args.php,str(pathlib.Path(__file__).with_name(file)),str(root),step,marker],capture_output=True,text=True)
                    if r.returncode:
                        error=root.parent/('cache-'+step+'-error.log');error.write_text(r.stdout+'\n'+r.stderr);error.chmod(0o600)
                        raise RuntimeError('Isolated cache '+step+' failed; private details retained')
                    results.append(json.loads(r.stdout))
            if args.profile and args.http_config:
                for file in ['checkin.php','social.php','password-recovery.php']:
                    r=subprocess.run([args.php,str(pathlib.Path(__file__).with_name(file)),str(root)],capture_output=True,text=True)
                    if r.returncode:
                        error=root.parent/('profile-'+file+'-error.log');error.write_text(r.stdout+'\n'+r.stderr);error.chmod(0o600)
                        raise RuntimeError('Private Redis regression failed '+file)
                    results.append({'suite':file,**json.loads(r.stdout)})
                r=subprocess.run(['python3',str(pathlib.Path(__file__).with_name('wpopt-http.py')),'--wp-root',str(root),'--php',args.php,'--config',args.http_config,'--cache-profile','--cache-marker',marker],capture_output=True,text=True,timeout=240)
                if r.returncode:
                    error=root.parent/'profile-http-error.log';error.write_text(r.stdout+'\n'+r.stderr);error.chmod(0o600)
                    raise RuntimeError('Private Redis HTTP regression failed; details retained privately')
                results.append({'suite':'http',**json.loads(r.stdout)})
        finally:
            try:
                if modified is not None:
                    if config.read_bytes()!=modified:raise RuntimeError('Fixture config changed concurrently; preserve files for review')
                    config.write_bytes(original);config.chmod(0o600)
                    if dropin.read_bytes()!=module:raise RuntimeError('Fixture drop-in changed concurrently; preserve it')
                    dropin.unlink()
            finally:
                redis.terminate()
                try:redis.wait(timeout=10)
                except subprocess.TimeoutExpired:redis.kill();redis.wait(timeout=10)
    if config.read_bytes()!=original or dropin.exists():raise RuntimeError('Fixture cache configuration not restored')
print(json.dumps({'profile':args.profile,'passed':sum(r['passed'] for r in results),'phases':results,'privateRedisStopped':redis.poll() is not None,'fixtureConfigRestored':True,'productionCacheUsed':False,'productionWritesEnabled':False}))
