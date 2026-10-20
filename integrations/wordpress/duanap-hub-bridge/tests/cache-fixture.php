<?php
// Run only with the drill's dedicated Unix-socket Redis instance, never live cache.
if(PHP_SAPI!=='cli'||count($argv)<3)exit(1);
$root=realpath($argv[1]);if(!$root||!is_file($root.'/duanap-hub-fixture.marker')||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
require_once __DIR__.'/fixture-bootstrap.php';$root=duanap_test_bootstrap($root);
$_SERVER['REMOTE_ADDR']='127.0.0.1';$_SERVER['REQUEST_METHOD']='GET';require $root.'/wp-load.php';
duanap_test_sinks();
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_')||!defined('WP_REDIS_SCHEME')||WP_REDIS_SCHEME!=='unix'||!defined('WP_REDIS_PATH')||!str_starts_with(WP_REDIS_PATH,sys_get_temp_dir().'/hub-p2-redis-')||!defined('WP_REDIS_PREFIX')||!str_starts_with(WP_REDIS_PREFIX,'hub-p2-audit-'))exit(1);
$action=$argv[2];$checks=[];
function cache_assert($name,$ok){global $checks;if(!$ok){fwrite(STDERR,'FAIL: '.$name."\n");exit(1);}$checks[]=$name;}
global $wp_object_cache,$wpdb;
cache_assert('actual Redis object cache is connected',wp_using_ext_object_cache()&&method_exists($wp_object_cache,'redis_status')&&$wp_object_cache->redis_status());
$marker=$argv[3]??'';if(!preg_match('/\A[a-f0-9]{32}\z/',$marker))exit(1);
$id=(int)$wpdb->get_var("SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key='duanap_hub_recovery_fixture' AND meta_value='1' ORDER BY user_id LIMIT 1");
if($action==='read'){
    if(!$id)exit(1);
    echo json_encode(['cache'=>(int)get_user_meta($id,'points',true),'database'=>(int)$wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->usermeta} WHERE user_id=%d AND meta_key='points'",$id))]);exit;
}
if($action==='set'){
    cache_assert('synthetic cache marker stored',wp_cache_set('marker-'.$marker,$marker,'duanap_recovery',60));
}elseif($action==='check'){
    cache_assert('cache survives a separate PHP process',wp_cache_get('marker-'.$marker,'duanap_recovery')===$marker);
    cache_assert('restored synthetic checkin account present',$id>0);
    $before=$wpdb->get_results($wpdb->prepare("SELECT meta_key,meta_value FROM {$wpdb->usermeta} WHERE user_id=%d ORDER BY umeta_id",$id),ARRAY_A);
    $ready=duanap_hub_checkin_ready();cache_assert('unverified persistent cache keeps write gate closed',is_wp_error($ready)&&$ready->get_error_code()==='hub_checkin_cache_unverified');
    $write=duanap_hub_checkin($id,duanap_hub_checkin_date());cache_assert('write request refuses actual persistent cache',is_wp_error($write)&&$write->get_error_code()==='hub_checkin_cache_unverified');
    $receipt=duanap_hub_checkin_result($id,duanap_hub_checkin_date());cache_assert('committed receipt remains queryable while writes are closed',!is_wp_error($receipt)&&$receipt['checked_in']===true&&$receipt['balance']===105);
    $after=$wpdb->get_results($wpdb->prepare("SELECT meta_key,meta_value FROM {$wpdb->usermeta} WHERE user_id=%d ORDER BY umeta_id",$id),ARRAY_A);
    cache_assert('refused cached write leaves user business metadata unchanged',$before===$after);
    cache_assert('cache marker removal scoped to this fixture',wp_cache_delete('marker-'.$marker,'duanap_recovery'));
}elseif($action==='transaction'){
    cache_assert('transaction probe uses a marked synthetic account',$id>0);
    $read=static function()use($root,$marker){
        $process=proc_open([PHP_BINARY,__FILE__,$root,'read',$marker],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
        if(!is_resource($process))throw new RuntimeException('Isolated cache reader failed');
        fclose($pipes[0]);$out=stream_get_contents($pipes[1]);fclose($pipes[1]);stream_get_contents($pipes[2]);fclose($pipes[2]);
        if(proc_close($process)!==0)throw new RuntimeException('Isolated cache reader failed');
        return json_decode($out,true,16,JSON_THROW_ON_ERROR);
    };
    $before=$wpdb->get_results($wpdb->prepare("SELECT meta_key,meta_value FROM {$wpdb->usermeta} WHERE user_id=%d ORDER BY umeta_id",$id),ARRAY_A);
    $baseline=$read();$temporary=$baseline['database']+777;
    cache_assert('probe starts with matching committed cache and database',$baseline['cache']===$baseline['database']);
    try{
        if($wpdb->query('START TRANSACTION')===false||!update_user_meta($id,'points',$temporary))throw new RuntimeException('Isolated transaction setup failed');
        // Standard native metadata read publishes this connection's uncommitted value.
        cache_assert('transaction can read its own provisional balance',(int)get_user_meta($id,'points',true)===$temporary);
        $other=$read();
        cache_assert('separate process observes Redis value before SQL commit',$other['cache']===$temporary&&$other['database']===$baseline['database']);
        if($wpdb->query('ROLLBACK')===false)throw new RuntimeException('Isolated rollback failed');
        $after=$read();
        cache_assert('rollback alone cannot undo the provisional Redis value',$after['cache']===$temporary&&$after['database']===$baseline['database']);
    }finally{
        $wpdb->query('ROLLBACK');duanap_hub_social_clear_cache($id);
    }
    $clean=$read();cache_assert('targeted invalidation restores the committed cache view',$clean['cache']===$baseline['database']&&$clean['database']===$baseline['database']);
    $after=$wpdb->get_results($wpdb->prepare("SELECT meta_key,meta_value FROM {$wpdb->usermeta} WHERE user_id=%d ORDER BY umeta_id",$id),ARRAY_A);
    cache_assert('negative cache probe leaves committed business metadata unchanged',$before===$after);
}else exit(1);
echo json_encode(['phase'=>$action,'passed'=>count($checks),'checks'=>$checks,'unsafeTransactionCacheReproduced'=>$action==='transaction','persistentCacheWritesEnabled'=>false,'productionCacheUsed'=>false]);
