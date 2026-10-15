"""Exercise real Redis while the unverified write gate remains closed."""
import argparse,importlib.util,json,os,pathlib,secrets,shutil,subprocess,tempfile,time
spec=importlib.util.spec_from_file_location('recovery_support',pathlib.Path(__file__).with_name('recovery-support.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
p=argparse.ArgumentParser();p.add_argument('--wp-root',required=True);p.add_argument('--php',default='php');p.add_argument('--redis-plugin-source',required=True)
args=p.parse_args();os.umask(0o077);root=support.fixture_root(args.wp_root)
support.assert_offline();support.preflight(root,args.php)
plugin=support.plugin_source(args.redis_plugin_source,'includes/object-cache.php')
target=root/'wp-content/plugins/redis-cache';dropin=root/'wp-content/object-cache.php';config=root/'wp-config.php'
if dropin.exists() or dropin.is_symlink():raise SystemExit('Do not replace an existing cache drop-in')
if target.exists():raise SystemExit('Use a restored fixture without Redis plugin changes')
shutil.copytree(plugin,target,ignore=shutil.ignore_patterns('*.log','.git'))
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
            modified=original.replace(b'<?php',b'<?php'+definitions.encode(),1)
            config.write_bytes(modified);config.chmod(0o600);dropin.write_bytes(module)
            for phase in ['set','check','transaction']:
                r=subprocess.run([args.php,str(pathlib.Path(__file__).with_name('cache-fixture.php')),str(root),phase,marker],capture_output=True,text=True)
                if r.returncode:
                    error=root.parent/('cache-'+phase+'-error.log');error.write_text(r.stdout+'\n'+r.stderr);error.chmod(0o600)
                    raise RuntimeError('Isolated cache '+phase+' failed; private details retained')
                results.append(json.loads(r.stdout))
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
print(json.dumps({'passed':sum(r['passed'] for r in results),'phases':results,'privateRedisStopped':redis.poll() is not None,'fixtureConfigRestored':True,'productionCacheUsed':False,'persistentCacheWritesEnabled':False}))
