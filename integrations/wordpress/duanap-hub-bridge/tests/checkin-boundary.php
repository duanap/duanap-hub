<?php
if(PHP_SAPI!=='cli'||count($argv)<4)exit(1);
$root=realpath($argv[1]);if(!$root||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
$_SERVER['REMOTE_ADDR']='127.0.0.1';require $root.'/wp-load.php';
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_')||!getenv('HUB_FIXTURE_UNIX_TIME'))exit(1);
$mode=$argv[2];$id=(int)$argv[3];
if($mode==='first'||$mode==='crossing'){
    $id=wp_create_user('bridge-midnight-'.bin2hex(random_bytes(10)),wp_generate_password(64,true));
    if(is_wp_error($id))exit(1);update_user_meta($id,'duanap_hub_daily_fixture',1);update_user_meta($id,'points',100);
}elseif(get_user_meta($id,'duanap_hub_daily_fixture',true)!=='1')exit(1);
$date=duanap_hub_checkin_date();
if($date!==current_time('Y-m-d'))exit(1);
if($mode==='crossing'){
    $advance=static function($meta_id,$user_id,$key)use($id){if((int)$user_id===$id&&$key==='checkin_all_day')putenv('HUB_FIXTURE_UNIX_TIME='.((int)getenv('HUB_FIXTURE_UNIX_TIME')+1));};
    add_action('added_user_meta',$advance,10,3);
    try{$result=duanap_hub_checkin($id,$date);}finally{remove_action('added_user_meta',$advance,10);}
    $lookup=duanap_hub_checkin_result($id,$date);
    echo json_encode(['crossing_refused'=>is_wp_error($result)&&($result->get_error_data()['status']??0)===409,'balance'=>(int)get_user_meta($id,'points',true),'total'=>(int)zib_get_user_checkin_all_day($id),'event_absent'=>!is_wp_error($lookup)&&$lookup['status']==='not_recorded']);exit;
}
$result=duanap_hub_checkin($id,$date);
if(is_wp_error($result)){fwrite(STDERR,$result->get_error_code());exit(1);}
$out=['id'=>$id,'date'=>$date,'points'=>$result['points_awarded'],'balance'=>$result['balance'],'continuous'=>$result['continuous_days'],'total'=>$result['total_days'],'receipt'=>$result['receipt']];
if($mode==='second'){
    $past=duanap_hub_checkin_result($id,'2026-10-14');$out['past_receipt']=$past['receipt'];
    $old=duanap_hub_checkin($id,'2026-10-14');$out['stale_write_refused']=is_wp_error($old)&&($old->get_error_data()['status']??0)===409;
    $out['native_record_count']=count(zib_get_user_meta($id,'points_record',true));
}
echo json_encode($out);
