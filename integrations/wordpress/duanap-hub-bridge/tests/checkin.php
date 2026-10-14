<?php
// Guarded CLI integration; no production users or tables.
if(PHP_SAPI!=='cli'||count($argv)<2)exit(1);
$root=realpath($argv[1]);
if(!$root||!is_file($root.'/duanap-hub-fixture.marker')||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
$_SERVER['REMOTE_ADDR']='127.0.0.1';require $root.'/wp-load.php';
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_'))exit(1);
$checks=[];
function check_daily($name,$ok){global $checks;if(!$ok){fwrite(STDERR,'FAIL: '.$name."\n");exit(1);}$checks[]=$name;}
check_daily('unified checkin service exists',function_exists('duanap_hub_checkin'));
duanap_hub_install_events();
$id=wp_create_user('bridge-daily-'.bin2hex(random_bytes(10)),wp_generate_password(64,true));
check_daily('synthetic account created',!is_wp_error($id));
global $wpdb;$wpdb->suppress_errors(true);
update_user_meta($id,'points',100);
$date=duanap_hub_checkin_date();
$first=duanap_hub_checkin($id,$date);
check_daily('native reward commits once',!is_wp_error($first)&&$first['status']==='success'&&$first['points_awarded']===5&&$first['balance']===105);
$second=duanap_hub_checkin($id,$date);
check_daily('retry returns same receipt without extra points',!is_wp_error($second)&&$second['status']==='already'&&$second['receipt']===$first['receipt']&&$second['balance']===105);
check_daily('result query confirms committed receipt',duanap_hub_checkin_result($id,$date)['receipt']===$first['receipt']);
$removed=[];
foreach(($GLOBALS['wp_filter']['user_checkined']->callbacks??[]) as $priority=>$callbacks)foreach($callbacks as $entry){
    $f=$entry['function'];if(is_array($f)&&is_object($f[0])&&get_class($f[0])==='zibpay_points_free_add'){$removed[]=[$f,$priority,$entry['accepted_args']];remove_action('user_checkined',$f,$priority);}
}
try{check_daily('missing native points callback refuses writes',is_wp_error(duanap_hub_checkin_ready()));}
finally{foreach($removed as [$f,$priority,$args])add_action('user_checkined',$f,$priority,$args);}
$prior_cache=(bool)wp_using_ext_object_cache();wp_using_ext_object_cache(true);
try{
    check_daily('unverified cache blocks writes',is_wp_error(duanap_hub_checkin($id,$date)));
    $lookup=duanap_hub_checkin_result($id,$date);
    check_daily('receipt lookup survives write readiness shutdown',!is_wp_error($lookup)&&$lookup['receipt']===$first['receipt']);
}finally{wp_using_ext_object_cache($prior_cache);}
check_daily('yesterday write refused',is_wp_error(duanap_hub_checkin($id,gmdate('Y-m-d',strtotime($date.' -1 day')))));
check_daily('UTC midnight boundary uses Beijing date',duanap_hub_checkin_date(strtotime('2026-10-14T15:59:59Z'))==='2026-10-14'&&duanap_hub_checkin_date(strtotime('2026-10-14T16:00:00Z'))==='2026-10-15');
$records=zib_get_user_meta($id,'points_record',true);
check_daily('native point history has one matching award',count($records)===1&&(int)$records[0]['value']===5&&(int)$records[0]['points']===105);
check_daily('native counters agree',zib_get_user_checkin_all_day($id)===1&&zib_get_user_checkin_continuous_day($id)===1);
// Failure after native point update must roll back every business write.
$fault=wp_create_user('bridge-daily-fault-'.bin2hex(random_bytes(10)),wp_generate_password(64,true));update_user_meta($fault,'points',100);
$wpdb->query("CREATE TRIGGER hub_fixture_event_failure BEFORE UPDATE ON {$wpdb->prefix}duanap_hub_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic event failure'");
try{
    $failed=duanap_hub_checkin($fault,$date);
    check_daily('event finalization failure is refused',is_wp_error($failed));
    duanap_hub_social_clear_cache($fault);
    check_daily('failure rolls back points and native checkin',get_user_meta($fault,'points',true)==='100'&&!zib_user_is_checkined($fault)&&!zib_get_user_meta($fault,'points_record',true));
    check_daily('failure leaves no completed receipt',duanap_hub_checkin_result($fault,$date)['status']==='not_recorded');
}finally{$wpdb->query('DROP TRIGGER IF EXISTS hub_fixture_event_failure');}
$retry=duanap_hub_checkin($fault,$date);check_daily('retry after rollback commits once',!is_wp_error($retry)&&$retry['balance']===105);
// Native free-point cap is authoritative; expected reward is not actual award.
$cap=wp_create_user('bridge-daily-cap-'.bin2hex(random_bytes(10)),wp_generate_password(64,true));update_user_meta($cap,'points',100);
zib_update_user_meta($cap,'free_points_detail',[$date=>100]);
$capped=duanap_hub_checkin($cap,$date);
check_daily('native cap reports zero actual award',!is_wp_error($capped)&&$capped['checked_in']&&$capped['points_awarded']===0&&$capped['balance']===100);
// Existing native sign-in must be observed, never awarded again.
$old=wp_create_user('bridge-daily-old-'.bin2hex(random_bytes(10)),wp_generate_password(64,true));update_user_meta($old,'points',100);zib_user_checkin($old);
$observed=duanap_hub_checkin($old,$date);
check_daily('existing native checkin is not rewarded twice',!is_wp_error($observed)&&$observed['status']==='already'&&$observed['points_awarded']===0&&$observed['balance']===105);
$fresh=wp_create_user('bridge-daily-first-'.bin2hex(random_bytes(10)),wp_generate_password(64,true));delete_user_meta($fresh,'points');
$wpdb->query($wpdb->prepare("CREATE TRIGGER hub_fixture_point_insert_failure BEFORE INSERT ON {$wpdb->usermeta} FOR EACH ROW BEGIN IF NEW.user_id=%d AND NEW.meta_key='points' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic first point failure'; END IF; END",$fresh));
try{
    $failed=duanap_hub_checkin($fresh,$date);
    check_daily('first point insertion failure refuses entire event',is_wp_error($failed));
    check_daily('first point failure leaves no point row or counters',!get_user_meta($fresh,'points',true)&&!zib_user_is_checkined($fresh)&&duanap_hub_checkin_result($fresh,$date)['status']==='not_recorded');
}finally{$wpdb->query('DROP TRIGGER IF EXISTS hub_fixture_point_insert_failure');}
$initial=duanap_hub_checkin($fresh,$date);
check_daily('first point row is created exactly once',!is_wp_error($initial)&&$initial['balance']===5&&(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->usermeta} WHERE user_id=%d AND meta_key='points'",$fresh))===1);
$lost=wp_create_user('bridge-daily-disconnect-'.bin2hex(random_bytes(10)),wp_generate_password(64,true));update_user_meta($lost,'points',100);$disconnected=false;
$disconnect=static function($sql)use($lost,&$disconnected){
    global $wpdb;
    if(!$disconnected&&str_starts_with($sql,"UPDATE {$wpdb->usermeta} SET meta_value = CAST")&&str_contains($sql,'user_id = '.$lost)&&str_contains($sql,"meta_key = 'points'")){
        [$host,$port,$socket]=$wpdb->parse_db_host(DB_HOST);
        $other=new mysqli($host,DB_USER,DB_PASSWORD,DB_NAME,$port??3306,$socket);$other->kill($wpdb->dbh->thread_id);$other->close();$disconnected=true;
    }
    return $sql;
};
add_filter('query',$disconnect,0);
try{
    $lost_result=duanap_hub_checkin($lost,$date);
    if(!$disconnected||!is_wp_error($lost_result)||get_user_meta($lost,'points',true)!=='100')fwrite(STDERR,json_encode(['disconnected'=>$disconnected,'refused'=>is_wp_error($lost_result),'syntheticBalance'=>(int)get_user_meta($lost,'points',true)])."\n");
    check_daily('database reconnect cannot commit an untracked reward',$disconnected&&is_wp_error($lost_result)&&get_user_meta($lost,'points',true)==='100'&&duanap_hub_checkin_result($lost,$date)['status']==='not_recorded');
}finally{remove_filter('query',$disconnect,0);}
$committed=wp_create_user('bridge-daily-ack-'.bin2hex(random_bytes(10)),wp_generate_password(64,true));update_user_meta($committed,'points',100);$ack_lost=false;
$lose_ack=static function($sql)use(&$ack_lost){
    global $wpdb;
    if($sql==='COMMIT'&&!$ack_lost){
        // Execute commit, then drop its connection before wpdb can receive proof.
        mysqli_query($wpdb->dbh,'COMMIT');[$host,$port,$socket]=$wpdb->parse_db_host(DB_HOST);
        $other=new mysqli($host,DB_USER,DB_PASSWORD,DB_NAME,$port??3306,$socket);$other->kill($wpdb->dbh->thread_id);$other->close();$ack_lost=true;
    }
    return $sql;
};
add_filter('query',$lose_ack,0);
try{
    $unknown=duanap_hub_checkin($committed,$date);
    check_daily('lost commit acknowledgment is not reported as success',$ack_lost&&is_wp_error($unknown));
}finally{remove_filter('query',$lose_ack,0);}
$confirmed=duanap_hub_checkin_result($committed,$date);$replayed=duanap_hub_checkin($committed,$date);
check_daily('committed reward survives lost acknowledgment and replays once',!is_wp_error($confirmed)&&$confirmed['balance']===105&&!is_wp_error($replayed)&&$replayed['receipt']===$confirmed['receipt']&&get_user_meta($committed,'points',true)==='105');
echo json_encode(['passed'=>count($checks),'checks'=>$checks,'productionDataUsed'=>false]);
