<?php
// Candidate deactivate/reactivate drill; CLI-only fresh development fixture.
if(PHP_SAPI!=='cli'||count($argv)<3)exit(1);
$root=realpath($argv[1]);if(!$root||!is_file($root.'/duanap-hub-fixture.marker')||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
$_SERVER['REMOTE_ADDR']='127.0.0.1';require $root.'/wp-load.php';
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_'))exit(1);
require_once ABSPATH.'wp-admin/includes/plugin.php';
global $wpdb;$wpdb->suppress_errors(true);$action=$argv[2];$id=(int)($argv[3]??0);
$bridge='duanap-hub-bridge/duanap-hub-bridge.php';
if($action==='create'){
    $result=duanap_hub_social_resolve(['provider'=>'qq','app_id'=>'900000001','subject'=>strtoupper(md5(random_bytes(32))),'display_name'=>'隔离回退用户']);
    if(is_wp_error($result))exit(1);$id=$result['user_id'];
    update_user_meta($id,'duanap_hub_rollout_fixture',1);update_user_meta($id,'points',100);
    $daily=duanap_hub_checkin($id,duanap_hub_checkin_date());if(is_wp_error($daily))exit(1);
    echo json_encode(['id'=>$id,'date'=>$daily['business_date']]);exit;
}
if(!$id||get_user_meta($id,'duanap_hub_rollout_fixture',true)!=='1')exit(1);
if($action==='snapshot'){
    $uid=$wpdb->get_var($wpdb->prepare("SELECT hub_uid FROM {$wpdb->prefix}duanap_hub_identities WHERE wp_user_id=%d AND active=1",$id));
    $social=$wpdb->get_col($wpdb->prepare("SELECT identity_key FROM {$wpdb->prefix}duanap_hub_social WHERE wp_user_id=%d",$id));
    $events=$wpdb->get_results($wpdb->prepare("SELECT receipt,business_date,result_json FROM {$wpdb->prefix}duanap_hub_events WHERE hub_uid=%s ORDER BY business_date",$uid),ARRAY_A);
    echo json_encode(['uid'=>$uid,'socialDigest'=>hash('sha256',wp_json_encode($social)),'eventsDigest'=>hash('sha256',wp_json_encode($events)),'eventCount'=>count($events),'balance'=>(int)get_user_meta($id,'points',true),'records'=>count(zib_get_user_meta($id,'points_record',true)),'total'=>(int)zib_get_user_checkin_all_day($id),'active'=>is_plugin_active($bridge)]);exit;
}
if($action==='disable'){deactivate_plugins($bridge);echo '{}';exit;}
if($action==='enable'){$error=activate_plugin($bridge);if(is_wp_error($error))exit(1);echo '{}';exit;}
if($action==='replay'){
    $result=duanap_hub_checkin($id,duanap_hub_checkin_date());if(is_wp_error($result))exit(1);
    echo json_encode(['status'=>$result['status'],'balance'=>$result['balance']]);exit;
}
exit(1);
