<?php
// CLI-only, marked synthetic fixture. Never install as a web hook.
if(PHP_SAPI!=='cli'||count($argv)<3)exit(1);
$root=realpath($argv[1]);if(!$root||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
$_SERVER['REMOTE_ADDR']='127.0.0.1';require $root.'/wp-load.php';
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_'))exit(1);
global $wpdb;$wpdb->suppress_errors(true);$action=$argv[2];$id=(int)($argv[3]??0);
if($action==='create'){
    $name='bridge-daily-http-'.bin2hex(random_bytes(10));$password=wp_generate_password(48,false);
    $id=wp_create_user($name,$password);if(is_wp_error($id))exit(1);
    update_user_meta($id,'duanap_hub_daily_fixture',1);update_user_meta($id,'points',100);
    // Only the harness captures these synthetic credentials; never print them in logs.
    echo json_encode(['id'=>$id,'username'=>$name,'password'=>$password]);exit;
}
if(!$id||get_user_meta($id,'duanap_hub_daily_fixture',true)!== '1')exit(1);
if($action==='snapshot'){
    $uid=duanap_hub_uid($id);
    $records=zib_get_user_meta($id,'points_record',true);
    echo json_encode(['balance'=>(int)get_user_meta($id,'points',true),'total'=>(int)zib_get_user_checkin_all_day($id),'continuous'=>(int)zib_get_user_checkin_continuous_day($id),'records'=>is_array($records)?count($records):0,'events'=>(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}duanap_hub_events WHERE hub_uid=%s AND result_json IS NOT NULL",$uid))]);exit;
}
if($action==='sources'){
    $uid=duanap_hub_uid($id);echo json_encode($wpdb->get_col($wpdb->prepare("SELECT DISTINCT source FROM {$wpdb->prefix}duanap_hub_events WHERE hub_uid=%s",$uid)));exit;
}
if($action==='hold'){
    $lock='dh-checkin-'.$id;
    if((string)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,0)',$lock))!=='1')exit(1);
    echo "ready\n";flush();sleep(3);$wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock));exit;
}
if($action==='commit'){
    $result=duanap_hub_checkin($id,duanap_hub_checkin_date());if(is_wp_error($result))exit(1);echo json_encode(['committed'=>$result['checked_in']]);exit;
}
if($action==='gate-query'){
    $write=duanap_hub_checkin($id,duanap_hub_checkin_date());$read=duanap_hub_checkin_result($id,duanap_hub_checkin_date());
    echo json_encode(['gateOff'=>!DUANAP_HUB_CHECKIN_ENABLED,'writeRefused'=>is_wp_error($write),'receiptReadable'=>!is_wp_error($read)&&$read['status']==='already']);exit;
}
if($action==='point-fault'){
    $sql=$wpdb->prepare("CREATE TRIGGER hub_fixture_daily_point_failure BEFORE UPDATE ON {$wpdb->usermeta} FOR EACH ROW BEGIN IF NEW.user_id=%d AND NEW.meta_key='points' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic daily point failure'; END IF; END",$id);
    if($wpdb->query($sql)===false)exit(1);echo '{}';exit;
}
if($action==='clear-fault'){$wpdb->query('DROP TRIGGER IF EXISTS hub_fixture_daily_point_failure');echo '{}';exit;}
exit(1);
