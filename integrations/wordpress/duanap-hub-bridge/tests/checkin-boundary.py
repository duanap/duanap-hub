"""Two real native executions across UTC 16:00 using a private process-only clock."""
import argparse,datetime,json,os,pathlib,subprocess
p=argparse.ArgumentParser();p.add_argument('--wp-root',required=True);p.add_argument('--php',default='php');p.add_argument('--preload',required=True);a=p.parse_args()
root=pathlib.Path(a.wp_root).resolve();preload=pathlib.Path(a.preload).resolve()
if (root/'duanap-hub-fixture.marker').read_text().strip()!='isolated' or not preload.is_relative_to(root.parent):raise SystemExit('Marked fixture/private preload required')
def run(mode,id,instant):
    env=dict(os.environ,LD_PRELOAD=str(preload),HUB_FIXTURE_UNIX_TIME=str(int(datetime.datetime.fromisoformat(instant).timestamp())))
    r=subprocess.run([a.php,str(pathlib.Path(__file__).with_name('checkin-boundary.php')),str(root),mode,str(id)],env=env,capture_output=True,text=True,check=True)
    return json.loads(r.stdout)
first=run('first',0,'2026-10-14T15:59:59+00:00');second=run('second',first['id'],'2026-10-14T16:00:00+00:00')
third=run('third',first['id'],'2026-10-16T16:00:00+00:00')
crossing=run('crossing',0,'2026-10-14T15:59:59+00:00')
checks={
 'real WP/native date before boundary':first['date']=='2026-10-14',
 'real WP/native date after boundary':second['date']=='2026-10-15',
 'native day-one reward':first['points']==5 and first['balance']==105,
 'native next-day continuous reward':second['points']==7 and second['balance']==112 and second['continuous']==2 and second['total']==2,
 'daily receipts distinct':first['receipt']!=second['receipt'],
 'old receipt survives date change':second['past_receipt']==first['receipt'] and second['stale_write_refused'],
 'native two-day history consistent':second['native_record_count']==2,
 'missed day resets native streak and reward':third['date']=='2026-10-17' and third['points']==5 and third['balance']==117 and third['continuous']==1 and third['total']==3,
 'transaction crossing midnight rolls back':crossing=={'crossing_refused':True,'balance':100,'total':0,'event_absent':True},
}
if not all(checks.values()):raise AssertionError([name for name,ok in checks.items() if not ok])
print(json.dumps({'passed':len(checks),'checks':list(checks),'clockScope':'isolated PHP process only','productionDataUsed':False}))
