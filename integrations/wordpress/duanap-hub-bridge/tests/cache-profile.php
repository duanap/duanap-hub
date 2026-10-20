<?php
if(PHP_SAPI!=='cli'||count($argv)<4)exit(1);
require_once __DIR__.'/fixture-bootstrap.php';$root=duanap_test_bootstrap(realpath($argv[1])?:'');
$_SERVER['REMOTE_ADDR']='127.0.0.1';$_SERVER['REQUEST_METHOD']='GET';require $root.'/wp-load.php';duanap_test_sinks();
if(!defined('WP_REDIS_SCHEME')||WP_REDIS_SCHEME!=='unix'||!defined('WP_REDIS_PATH')||!str_starts_with(WP_REDIS_PATH,sys_get_temp_dir().'/hub-p2-redis-')||!defined('WP_REDIS_PREFIX')||!str_starts_with(WP_REDIS_PREFIX,'hub-p2-audit-'))exit(1);
global $wp_object_cache,$wpdb;$mode=$argv[2];$marker=$argv[3];$checks=[];
function profile_assert($name,$ok){global $checks;if(!$ok){fwrite(STDERR,'FAIL: '.$name."\n");exit(1);}$checks[]=$name;}
profile_assert('real Redis cache connected',wp_using_ext_object_cache()&&$wp_object_cache->redis_status());
if(!preg_match('/\A[a-f0-9]{32}\z/',$marker))exit(1);
if(WP_REDIS_PREFIX!=='hub-p2-audit-'.$marker)exit(1);
if($mode==='read'){
    $id=(int)($argv[4]??0);$user=get_user_by('id',$id);
    if(!$user||(!str_starts_with($user->user_login,'bridge-cache-policy-')&&get_user_meta($id,'duanap_hub_recovery_fixture',true)!=='1'))exit(1);
    $records=zib_get_user_meta($id,'points_record',true);
    echo json_encode(['balance'=>(int)get_user_meta($id,'points',true),'database'=>(int)$wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->usermeta} WHERE user_id=%d AND meta_key='points'",$id)),'checked'=>(bool)zib_user_is_checkined($id),'records'=>is_array($records)?count($records):0,'contentMarker'=>wp_cache_get('content-'.$marker,'duanap_recovery')]);exit;
}
if($mode==='seed-stale'){
    $id=(int)$wpdb->get_var("SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key='duanap_hub_recovery_fixture' AND meta_value='1' ORDER BY user_id LIMIT 1");
    profile_assert('seed targets a restored synthetic user',$id>0);
    $values=$wpdb->get_results($wpdb->prepare("SELECT meta_key,meta_value FROM {$wpdb->usermeta} WHERE user_id=%d",$id),ARRAY_A);$metadata=[];
    foreach($values as $value)$metadata[$value['meta_key']][]=$value['meta_value'];$metadata['points']=['-777'];
    profile_assert('old shared metadata cache seeded',wp_cache_set($id,$metadata,'user_meta'));
    profile_assert('old shared theme cache seeded',wp_cache_set('user_meta_'.$id,['points_record'=>[['value'=>777]]],'zib_option_meta_data'));
    profile_assert('unrelated content group remains persistent',wp_cache_set('content-'.$marker,'persistent','duanap_recovery',120));
    echo json_encode(['case'=>$mode,'passed'=>count($checks),'checks'=>$checks]);exit;
}
if($mode==='runtime-group-mismatch')$wp_object_cache->group_type['user_meta']='global';
if($mode==='runtime-only')wp_cache_add_non_persistent_groups(['users','userlogins','useremail','userslugs','user_meta','zib_option_meta_data']);
$saved_dropin=null;$real_backend=$wp_object_cache;
try{
    if($mode==='external-flag-mismatch')wp_using_ext_object_cache(false);
    if($mode==='dropin-mismatch'){$file=WP_CONTENT_DIR.'/object-cache.php';$saved_dropin=file_get_contents($file);file_put_contents($file,$saved_dropin."\n// Synthetic unsupported drop-in change.\n");}
    if($mode==='unsupported-backend')$wp_object_cache=new stdClass();
    $ready=$mode==='unsupported-backend'?duanap_hub_checkin_cache_ready():duanap_hub_checkin_ready();
}finally{
    if($mode==='external-flag-mismatch')wp_using_ext_object_cache(true);
    $wp_object_cache=$real_backend;
    if($saved_dropin!==null)file_put_contents(WP_CONTENT_DIR.'/object-cache.php',$saved_dropin);
}
if($mode==='validate'){
    profile_assert('private complete Redis profile is ready',!is_wp_error($ready));
    echo json_encode(['case'=>$mode,'passed'=>count($checks),'checks'=>$checks]);exit;
}
if($mode!=='good'){
    profile_assert('incomplete profile refuses writes',is_wp_error($ready)&&$ready->get_error_code()==='hub_checkin_cache_unverified');
}else{
    profile_assert('complete startup and runtime profile allows isolated checkin',!is_wp_error($ready));
    $read=static function($id)use($root,$marker){
        $process=proc_open([PHP_BINARY,__FILE__,$root,'read',$marker,(string)$id],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
        if(!is_resource($process))throw new RuntimeException('Isolated reader failed');
        fclose($pipes[0]);$output=stream_get_contents($pipes[1]);fclose($pipes[1]);stream_get_contents($pipes[2]);fclose($pipes[2]);
        if(proc_close($process)!==0)throw new RuntimeException('Isolated reader failed');return json_decode($output,true,16,JSON_THROW_ON_ERROR);
    };
    $restored=(int)$wpdb->get_var("SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key='duanap_hub_recovery_fixture' AND meta_value='1' ORDER BY user_id LIMIT 1");
    $old=$read($restored);profile_assert('startup policy ignores pre-existing stale shared metadata',$old['balance']===$old['database']&&$old['balance']===105);
    profile_assert('content cache survives while business groups stay local',$old['contentMarker']==='persistent');
    $id=wp_create_user('bridge-cache-policy-'.bin2hex(random_bytes(10)),wp_generate_password(48,true));
    profile_assert('synthetic user created',!is_wp_error($id));update_user_meta($id,'points',100);
    $wpdb->query('START TRANSACTION');
    try{
        update_user_meta($id,'points',777);zib_update_user_meta($id,'points_record',[['value'=>677,'points'=>777]]);
        profile_assert('writer sees its provisional native and theme metadata',(int)get_user_meta($id,'points',true)===777&&count(zib_get_user_meta($id,'points_record',true))===1);
        $other=$read($id);profile_assert('another process cannot see provisional balance or records',$other['balance']===100&&$other['database']===100&&$other['records']===0);
    }finally{$wpdb->query('ROLLBACK');duanap_hub_social_clear_cache($id);}
    $after=$read($id);profile_assert('rollback leaves no shared provisional business cache',$after['balance']===100&&$after['database']===100&&$after['records']===0);
    $result=duanap_hub_checkin($id,duanap_hub_checkin_date());
    profile_assert('profile commits one real native reward',!is_wp_error($result)&&$result['status']==='success'&&$result['balance']===105);
    $committed=$read($id);profile_assert('new process immediately sees committed native ledger',$committed['balance']===105&&$committed['database']===105&&$committed['checked']&&$committed['records']===1);
    $repeat=duanap_hub_checkin($id,duanap_hub_checkin_date());
    profile_assert('retry preserves receipt and balance',!is_wp_error($repeat)&&$repeat['status']==='already'&&$repeat['receipt']===$result['receipt']&&$repeat['balance']===105);
    $bad=wp_create_user('bridge-cache-policy-fault-'.bin2hex(random_bytes(10)),wp_generate_password(48,true));update_user_meta($bad,'points',100);
    if($wpdb->query("CREATE TRIGGER hub_profile_receipt_failure BEFORE UPDATE ON {$wpdb->prefix}duanap_hub_events FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic receipt failure'")===false)exit(1);
    try{
        $failed=duanap_hub_checkin($bad,duanap_hub_checkin_date());$state=$read($bad);
        profile_assert('receipt failure rolls back native and cached state',is_wp_error($failed)&&$state['balance']===100&&!$state['checked']&&$state['records']===0);
    }finally{$wpdb->query('DROP TRIGGER IF EXISTS hub_profile_receipt_failure');}
    $retry=duanap_hub_checkin($bad,duanap_hub_checkin_date());profile_assert('retry after failed transaction awards exactly once',!is_wp_error($retry)&&$retry['balance']===105);
}
echo json_encode(['case'=>$mode,'passed'=>count($checks),'checks'=>$checks,'productionWritesEnabled'=>false]);
