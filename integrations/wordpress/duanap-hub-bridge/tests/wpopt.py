"""Audit an installed plugin's code against safe flags in an offline fixture."""
import argparse,importlib.util,json,os,pathlib,shutil,subprocess
spec=importlib.util.spec_from_file_location('recovery_support',pathlib.Path(__file__).with_name('recovery-support.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
p=argparse.ArgumentParser();p.add_argument('--wp-root',required=True);p.add_argument('--php',default='php');p.add_argument('--plugin-source',required=True);p.add_argument('--safe-flags',required=True)
args=p.parse_args();os.umask(0o077);root=support.fixture_root(args.wp_root)
support.assert_offline();support.preflight(root,args.php)
plugin=support.plugin_source(args.plugin_source,'index.php');target=root/'wp-content/plugins/wp-opt'
if target.exists():raise SystemExit('Use a fresh restored fixture without WPOPT')
safe=json.loads(pathlib.Path(args.safe_flags).read_text())
allowed=['safe_login_limit','safe_login_limit_number','safe_need_login','close_rest_api','close_rss','close_rss_search','close_community_events','close_mail_update_user_info_note','close_mail_register_note','close_email_check','query_cache_open','module_post_views_open']
if not isinstance(safe,dict) or any(k not in allowed or not isinstance(v,(bool,int,str)) or (isinstance(v,str) and (not v.isdigit() or len(v)>4)) for k,v in safe.items()):raise SystemExit('Only allowlisted boolean/integer flags are accepted')
shutil.copytree(plugin,target,ignore=shutil.ignore_patterns('*.log','.git'))
tests=pathlib.Path(__file__).parent;results=[]
def run(file,phase=None,body=None):
    argv=[args.php,str(tests/file),str(root)]+([phase] if phase else [])
    r=subprocess.run(argv,input=body,capture_output=True,text=True)
    if r.returncode:
        path=root.parent/('wpopt-'+file+'-error.log');path.write_text(r.stdout+'\n'+r.stderr);path.chmod(0o600)
        raise RuntimeError('Isolated plugin combination failed '+file+'; private details retained')
    return json.loads(r.stdout)
run('wpopt-fixture.php','enable',json.dumps(safe))
state=run('wpopt-fixture.php','inspect')
if not state['wpoptActive'] or state['externalObjectCache'] or not state['checkinReady']:raise RuntimeError('Expected offline plugin combination is not ready')
for name in ['checkin.php','social.php','password-recovery.php']:results.append(run(name))
report={'wpoptActive':True,'allowlistedFlags':len(safe),'passed':sum(x['passed'] for x in results),'suites':results,'persistentCacheWritesEnabled':False,'realMailDelivered':False,'productionChanged':False,'productionSecretsCopied':False}
file=root.parent/'wpopt-result.json';file.write_text(json.dumps(report));file.chmod(0o600)
print(json.dumps(report))
