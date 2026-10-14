"""Actual Bridge deactivation/reactivation without restoring an old business DB."""
import argparse,json,pathlib,subprocess
p=argparse.ArgumentParser();p.add_argument('--wp-root',required=True);p.add_argument('--php',default='php');a=p.parse_args()
root=pathlib.Path(a.wp_root).resolve()
if (root/'duanap-hub-fixture.marker').read_text().strip()!='isolated':raise SystemExit('Marked fixture required')
if subprocess.run(['systemctl','is-active','--quiet','duanap-p2-audit.service'],capture_output=True).returncode==0:raise SystemExit('Stop fixture HTTP before plugin changes')
def run(action,id=0):
    r=subprocess.run([a.php,str(pathlib.Path(__file__).with_name('rollout-fixture.php')),str(root),action,str(id)],capture_output=True,text=True,check=True)
    return json.loads(r.stdout)
checks=[]
def check(name,ok):
    if not ok:raise AssertionError(name)
    checks.append(name)
user=run('create');before=run('snapshot',user['id']);check('candidate active before drill',before.pop('active'))
try:
    run('disable',user['id']);off=run('snapshot',user['id']);check('Bridge actually deactivated',off.pop('active') is False)
    check('disabled plugin retains UID binding and business state',off==before)
    run('enable',user['id']);enabled=run('snapshot',user['id']);check('Bridge reactivated with activation hooks',enabled.pop('active'))
    check('reactivation preserves exact identities and receipts',enabled==before)
    replay=run('replay',user['id']);check('post-reactivation checkin cannot award twice',replay=={'status':'already','balance':105})
    after=run('snapshot',user['id']);after.pop('active');check('replay retains exact business state',after==before and after['eventCount']==1 and after['records']==1)
finally:
    # Even a failed assertion must leave the isolated candidate active for reuse.
    run('enable',user['id'])
print(json.dumps({'passed':len(checks),'checks':checks,'databaseSnapshotRestored':False,'productionDataUsed':False}))
