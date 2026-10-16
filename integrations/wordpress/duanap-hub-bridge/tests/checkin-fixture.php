<?php
// CLI-only, marked synthetic fixture. Never install as a web hook.
if(PHP_SAPI!=='cli'||count($argv)<3)exit(1);
require_once __DIR__.'/fixture-bootstrap.php';$root=duanap_test_bootstrap(realpath($argv[1])?:'');
$_SERVER['REMOTE_ADDR']='127.0.0.1';require $root.'/wp-load.php';
duanap_test_sinks();
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_'))exit(1);
global $wpdb;$wpdb->suppress_errors(true);$action=$argv[2];$id=(int)($argv[3]??0);
if(in_array($action,['login-policy-on','login-policy-off'],true)){
    $options=get_option('zibll_options');$key='duanap_hub_fixture_login_policy';
    if($action==='login-policy-on'){
        if(get_option($key)!==false)exit(1);
        $saved=[];foreach(['points_free_opt','user_integral_opt','user_level_s','checkin_s'] as $field)$saved[$field]=['exists'=>array_key_exists($field,$options),'value'=>$options[$field]??null];update_option($key,$saved);
        $options['points_free_opt']=array_replace($options['points_free_opt']??[],['sign_in'=>5,'sign_up'=>20]);
        $options['user_integral_opt']=array_replace($options['user_integral_opt']??[],['sign_in'=>3,'sign_up'=>0]);$options['user_level_s']=true;
    }else{
        $saved=get_option($key);if(!is_array($saved))exit(1);
        foreach($saved as $field=>$value){if($value['exists'])$options[$field]=$value['value'];else unset($options[$field]);}delete_option($key);
    }
    update_option('zibll_options',$options);echo json_encode(['policyUpdated'=>true]);exit;
}
if(in_array($action,['login-checkin-off','login-checkin-on'],true)){
    if(!is_array(get_option('duanap_hub_fixture_login_policy')))exit(1);
    $options=get_option('zibll_options');$options['checkin_s']=$action==='login-checkin-on';update_option('zibll_options',$options);echo json_encode(['checkinSettingUpdated'=>true]);exit;
}
if($action==='create'){
    $name='bridge-daily-http-'.bin2hex(random_bytes(10));$password=wp_generate_password(48,false);
    $id=wp_create_user($name,$password);if(is_wp_error($id))exit(1);
    update_user_meta($id,'duanap_hub_daily_fixture',1);update_user_meta($id,'points',100);
    // Only the harness captures these synthetic credentials; never print them in logs.
    echo json_encode(['id'=>$id,'username'=>$name,'password'=>$password]);exit;
}
if(!$id||get_user_meta($id,'duanap_hub_daily_fixture',true)!== '1')exit(1);
if($action==='login-snapshot'){
    $records=zib_get_user_meta($id,'points_record',true);
    echo json_encode(['balance'=>(int)get_user_meta($id,'points',true),'integral'=>(int)get_user_meta($id,'level_integral',true),'pointsDate'=>zib_get_user_meta($id,'_signin_points_time',true),'integralDate'=>zib_get_user_meta($id,'_signin_integral_time',true),'records'=>is_array($records)?count($records):0]);exit;
}
if($action==='login-fault'){
    if($wpdb->query("CREATE TRIGGER hub_fixture_login_failure BEFORE UPDATE ON {$wpdb->usermeta} FOR EACH ROW BEGIN IF NEW.user_id=$id AND NEW.meta_key='points' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic login reward failure'; END IF; END")===false)exit(1);
    echo json_encode(['faultInstalled'=>true]);exit;
}
if($action==='login-clear-fault'){$wpdb->query('DROP TRIGGER IF EXISTS hub_fixture_login_failure');echo json_encode(['faultCleared'=>true]);exit;}
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
