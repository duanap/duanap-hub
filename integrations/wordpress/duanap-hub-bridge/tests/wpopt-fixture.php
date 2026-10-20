<?php
if(PHP_SAPI!=='cli'||count($argv)<3)exit(1);
$root=realpath($argv[1]);if(!$root||!is_file($root.'/duanap-hub-fixture.marker')||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
require_once __DIR__.'/fixture-bootstrap.php';$root=duanap_test_bootstrap($root);
$_SERVER['REMOTE_ADDR']='127.0.0.1';require $root.'/wp-load.php';
duanap_test_sinks();
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_'))exit(1);
require_once ABSPATH.'wp-admin/includes/plugin.php';$action=$argv[2];
if($action==='enable'){
    $safe=json_decode(stream_get_contents(STDIN),true);
    $allowed=['safe_login_limit','safe_login_limit_number','safe_need_login','close_rest_api','close_rss','close_rss_search','close_community_events','close_mail_update_user_info_note','close_mail_register_note','close_email_check','query_cache_open','module_post_views_open'];
    if(!is_array($safe))exit(1);foreach($safe as $key=>$value)if(!in_array($key,$allowed,true)||(!is_bool($value)&&!is_int($value)&&!(is_string($value)&&preg_match('/\A[0-9]{1,4}\z/',$value))))exit(1);
    $raw=get_option('wp_opt_set','');$settings=is_string($raw)?json_decode(base64_decode($raw,true)?:'',true):[];if(!is_array($settings))$settings=[];
    update_option('wp_opt_set',base64_encode(wp_json_encode(array_replace($settings,$safe))));
    $r=activate_plugin('wp-opt/index.php');if(is_wp_error($r))exit(1);
    echo json_encode(['enabled'=>true,'allowlistedFlags'=>count($safe)]);exit;
}
if($action==='inspect'){
    $hooks=[];foreach(['user_checkined','updated_user_meta','added_user_meta','wp_login','authenticate','init'] as $name){
        $hooks[$name]=[];foreach(($GLOBALS['wp_filter'][$name]->callbacks??[]) as $priority=>$callbacks)foreach($callbacks as $entry){
            $f=$entry['function'];$label=is_string($f)?$f:(is_array($f)?(is_object($f[0])?get_class($f[0]):$f[0]).'::'.$f[1]:'closure');$hooks[$name][]=$label;
        }
    }
    $ready=duanap_hub_checkin_ready();
    echo json_encode(['wpoptActive'=>is_plugin_active('wp-opt/index.php'),'externalObjectCache'=>wp_using_ext_object_cache(),'checkinReady'=>!is_wp_error($ready),'errorCode'=>is_wp_error($ready)?$ready->get_error_code():null,'hooks'=>$hooks]);exit;
}
exit(1);
