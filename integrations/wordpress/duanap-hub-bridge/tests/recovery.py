"""Offline full-schema restore acceptance. NEVER a production restore command."""
import argparse,hashlib,importlib.util,json,os,pathlib,re,secrets,shutil,subprocess

spec=importlib.util.spec_from_file_location('recovery_support',pathlib.Path(__file__).with_name('recovery-support.py'))
support=importlib.util.module_from_spec(spec);spec.loader.exec_module(support)
parser=argparse.ArgumentParser();parser.add_argument('--wp-root',required=True);parser.add_argument('--php',default='php')
args=parser.parse_args();os.umask(0o077)
source=support.fixture_root(args.wp_root)
support.assert_offline();support.preflight(source,args.php)
work=support.new_target(source,source.parent/('restore-'+secrets.token_hex(8)));work.mkdir(mode=0o700)
checks=[]
def check(name,condition):
    if not condition:raise RuntimeError(name)
    checks.append(name)
def command(argv,**options):
    result=subprocess.run(argv,capture_output=True,**options)
    if result.returncode:
        private_json(work/'command-error.json',{'stdout':str(result.stdout),'stderr':str(result.stderr)})
        raise RuntimeError('Isolated command failed: '+pathlib.Path(argv[0]).name+' (details retained privately, no credentials printed)')
    return result.stdout
def fixture(root,action,id=0):
    output=command([args.php,str(pathlib.Path(__file__).with_name('recovery-fixture.php')),str(root),action,str(id)],text=True)
    return json.loads(output)
def raw_snapshot(root,connection):
    output=command([args.php,str(pathlib.Path(__file__).with_name('recovery-fixture.php')),str(root),'raw-snapshot'],input=json.dumps(connection),text=True)
    return json.loads(output)
def root_sql(sql):return command(['mariadb','--protocol=socket','--socket=/run/mysqld/mysqld.sock','--user=root'],input=sql.encode())
def private_json(path,value):path.write_text(json.dumps(value,indent=2));path.chmod(0o600)
def client_file(path,connection):
    def quoted(value):return '"'+str(value).replace('\\','\\\\').replace('"','\\"').replace('\n','\\n')+'"'
    if connection['host']!='localhost:/run/mysqld/mysqld.sock':raise RuntimeError('Only the isolated local database socket is supported')
    text='[client]\nprotocol=socket\nsocket=/run/mysqld/mysqld.sock\nuser='+quoted(connection['user'])+'\npassword='+quoted(connection['password'])+'\n'
    path.write_text(text);path.chmod(0o600)
def fingerprints(folder):
    return {p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(folder.rglob('*')) if p.is_file()}

connection=fixture(source,'connection');support.fixture_database(connection['database'])
check('source uses its own isolated database account',connection['user']==connection['database'])
check('source core and full theme remain marked isolated',support.fixture_root(source)==source)
user=fixture(source,'create');before_state=fixture(source,'state',user['id'])
check('synthetic native daily reward committed once',user['balance']==105 and before_state['eventCount']==1 and before_state['records']==1)
before=fixture(source,'snapshot')
provider=[name for name in before if name.startswith(connection['prefix']+'oauth_')]
required=['users','usermeta','options','posts','postmeta','duanap_hub_identities','duanap_hub_social','duanap_hub_recent_auth','duanap_hub_social_transactions','duanap_hub_events']
check('full snapshot includes native Bridge and Provider schemas',all(connection['prefix']+name in before for name in required) and len(provider)>=3)
private_json(work/'source-fingerprint.json',before)
archive=work/'archive';archive.mkdir(mode=0o700)
source_client=work/'source-client.cnf';client_file(source_client,connection)
dump=archive/'database.sql'
with dump.open('xb') as output:
    result=subprocess.run(['mariadb-dump','--defaults-extra-file='+str(source_client),'--single-transaction','--quick','--skip-lock-tables','--skip-add-locks','--skip-comments','--hex-blob','--skip-triggers',connection['database']],stdout=output,stderr=subprocess.PIPE)
if result.returncode:raise RuntimeError('Isolated consistent dump failed')
dump.chmod(0o600)
shutil.copytree(source,archive/'files',ignore=shutil.ignore_patterns('__pycache__'))
manifest=fingerprints(archive);private_json(work/'manifest.json',manifest)
support.verify_artifacts(archive,manifest)
check('private database and file artifacts verified before restore',dump.stat().st_size>0 and (work.stat().st_mode&0o777)==0o700 and (dump.stat().st_mode&0o777)==0o600)
check('source table snapshot unchanged by backup',raw_snapshot(source,connection)==before)
fixture(source,'late-write',user['id']);source_late=raw_snapshot(source,connection)
check('source can commit a later write after backup',fixture(source,'has-late-write',user['id'])['present'])
target=work/'wordpress'
if target.exists():raise RuntimeError('Restore target must not exist')
database=support.fixture_database('hub_p2_audit_'+secrets.token_hex(10))
check('restore uses a new database distinct from source',database!=connection['database'])
password=secrets.token_urlsafe(36)
root_sql('CREATE DATABASE `'+database+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER \''+database+"'@'localhost' IDENTIFIED BY '"+password+"'; GRANT ALL PRIVILEGES ON `"+database+"`.* TO '"+database+"'@'localhost';")
target_connection=dict(connection,database=database,user=database,password=password)
private_json(work/'restore-connection.json',target_connection)
target_client=work/'target-client.cnf';client_file(target_client,target_connection)
support.verify_artifacts(archive,manifest)
with dump.open('rb') as input_file:
    result=subprocess.run(['mariadb','--defaults-extra-file='+str(target_client),database],stdin=input_file,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
if result.returncode:raise RuntimeError('Isolated import failed; source unchanged')
shutil.copytree(archive/'files',target)
copied=fingerprints(target)
check('all backed-up WordPress files restored exactly before private config rewrite',copied=={k.removeprefix('files/'):v for k,v in manifest.items() if k.startswith('files/')})
config_path=target/'wp-config.php';config=config_path.read_text()
for key,value in [('DB_NAME',database),('DB_USER',database),('DB_PASSWORD',password)]:
    pattern=r"define\(\s*(['\"])"+key+r"\1\s*,\s*(?:'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")\s*\);"
    config,count=re.subn(pattern,lambda match:"define('"+key+"', '"+value+"');",config)
    if count!=1:raise RuntimeError('Unexpected fixture database config format')
config_path.write_text(config);config_path.chmod(0o600)
check('restored root remains synthetic and isolated',support.fixture_root(target)==target)
restored=raw_snapshot(target,target_connection)
check('every restored table matches the pre-backup fingerprint',restored==before)
check('Provider private tables restored without omissions',all(restored[name]==before[name] for name in provider))
check('restored WordPress boots against its own new database',fixture(target,'connection')['database']==database)
check('later source write is absent from restored snapshot',not fixture(target,'has-late-write',user['id'])['present'])
check('UID binding native balance records days and receipts match',fixture(target,'state',user['id'])==before_state)
replay=fixture(target,'replay',user['id'])
check('restored same-day retry returns original receipt without awarding again',replay=={'status':'already','receipt':user['receipt'],'balance':105})
check('retry leaves all business state unchanged',fixture(target,'state',user['id'])==before_state)
check('restore and replay do not overwrite later source changes',raw_snapshot(source,connection)==source_late and fixture(source,'has-late-write',user['id'])['present'])
check('archive remains intact after recovery',fingerprints(archive)==manifest)
report={'passed':len(checks),'checks':checks,'sourceTables':len(before),'providerTables':len(provider),'productionDataUsed':False,'productionRestorePerformed':False,'sourceSnapshotOverwritten':False,'networkAuthorizationTested':False}
private_json(work/'result.json',report)
print(json.dumps(report))
