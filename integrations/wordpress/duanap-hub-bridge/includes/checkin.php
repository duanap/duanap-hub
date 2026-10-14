<?php
defined('ABSPATH') || exit;

function duanap_hub_checkin_ready() {
    global $wpdb;
    if(!defined('DUANAP_HUB_CHECKIN_ENABLED')||DUANAP_HUB_CHECKIN_ENABLED!==true)return new WP_Error('hub_checkin_disabled','签到写入尚未启用。',['status'=>503]);
    $ready=duanap_hub_zibll_ready();if(is_wp_error($ready))return $ready;
    if(!_pz('checkin_s')||!_pz('points_s')||!function_exists('zib_user_checkin'))return new WP_Error('hub_checkin_disabled','博客签到或积分功能未启用。',['status'=>503]);
    if(wp_using_ext_object_cache())return new WP_Error('hub_checkin_cache_unverified','持久对象缓存尚未通过签到一致性验收。',['status'=>503]);
    if(!($wpdb->dbh instanceof mysqli))return new WP_Error('hub_checkin_driver_unavailable','签到数据库驱动尚未验收。',['status'=>503]);
    $ready=duanap_hub_events_ready();if(is_wp_error($ready))return $ready;
    foreach([$wpdb->usermeta] as $table){
        $engine=$wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s',DB_NAME,$table));
        if($wpdb->last_error||$engine!=='InnoDB')return new WP_Error('hub_checkin_storage_unavailable','签到存储必须支持事务。',['status'=>503]);
    }
    // Additional business callbacks have not been audited for rollback/side effects.
    $seen=[];
    foreach(($GLOBALS['wp_filter']['user_checkined']->callbacks??[]) as $callbacks)foreach($callbacks as $entry){
        $f=$entry['function'];$name=is_array($f)&&is_object($f[0])?get_class($f[0]).'::'.$f[1]:'';
        if(!in_array($name,['zib_user_level_integral_add::user_checkined','zibpay_points_free_add::user_checkined'],true))return new WP_Error('hub_checkin_hooks_unverified','签到扩展钩子尚未通过事务验收。',['status'=>503]);
        $seen[]=$name;
    }
    if(count(array_filter($seen,static fn($name)=>$name==='zibpay_points_free_add::user_checkined'))!==1)return new WP_Error('hub_checkin_hooks_unverified','原生积分签到钩子缺失或重复。',['status'=>503]);
    return true;
}
function duanap_hub_checkin_meta($id,$key,$default='') {
    global $wpdb;
    $values=$wpdb->get_col($wpdb->prepare("SELECT meta_value FROM {$wpdb->usermeta} WHERE user_id=%d AND meta_key=%s",$id,$key));
    if($wpdb->last_error||count($values)>1)throw new RuntimeException('Invalid metadata');
    if(!$values)return $default;
    return is_serialized($values[0])?unserialize($values[0],['allowed_classes'=>false]):$values[0];
}
function duanap_hub_checkin_snapshot($id) {
    $data=duanap_hub_checkin_meta($id,'zib_other_data',[]);
    if(!is_array($data))throw new RuntimeException('Invalid native data');
    $result=['data'=>$data];
    foreach(['points','level_integral','checkin_all_day','checkin_continuous_day'] as $key){
        $value=duanap_hub_checkin_meta($id,$key,0);$integer=duanap_hub_native_integer($value);
        if($integer===null||$integer<0||$integer>9007199254740991)throw new RuntimeException('Invalid counter');
        $result[$key]=$integer;
    }
    foreach(['checkin_detail','checkin_reward_days','points_record','free_points_detail'] as $key)if(isset($data[$key])&&!is_array($data[$key]))throw new RuntimeException('Invalid ledger');
    return $result;
}
function duanap_hub_checkin_sql_guard($query) {
    global $wpdb;
    // wpdb filters before flushing last_error: trap any failed previous query,
    // including failures ignored by native business functions.
    if($wpdb->last_error)throw new RuntimeException('Native query failed');
    if(preg_match('/\A\s*(?:START|BEGIN|COMMIT|ROLLBACK|ALTER|CREATE|DROP|TRUNCATE|RENAME|LOCK|UNLOCK|SET)\b/i',$query))throw new RuntimeException('Unsupported native transaction query');
    // wpdb may reconnect and retry a query after MySQL has rolled back its
    // connection. Enforce the transaction in the retried SQL itself, so it
    // cannot become an autocommitted reward. Only audited single-row inserts
    // and metadata/event updates/deletes are supported.
    $tables='(?:'.implode('|',array_map(static fn($t)=>preg_quote($t,'/'),[$wpdb->usermeta,$wpdb->prefix.'duanap_hub_identities',$wpdb->prefix.'duanap_hub_events'])).')';
    if(preg_match('/\A\s*(INSERT(?:\s+IGNORE)?\s+INTO\s+`?'.$tables.'`?\s*\([^)]*\))\s+VALUES\s*\((.*)\)\s*;?\s*\z/is',$query,$parts))return $parts[1].' SELECT '.$parts[2].' WHERE @@in_transaction=1';
    if(preg_match('/\A\s*(?:UPDATE\s+`?'.$tables.'`?\s+SET|DELETE\s+FROM\s+`?'.$tables.'`?)\b/is',$query)&&str_contains($query,' WHERE '))return rtrim($query,"; \t\r\n").' AND @@in_transaction=1';
    if(!preg_match('/\A\s*(?:SELECT|SHOW)\b/i',$query))throw new RuntimeException('Unsupported native write query');
    return $query;
}
function duanap_hub_checkin_commit($connection,&$guard) {
    global $wpdb;
    $state=$wpdb->get_row('SELECT CONNECTION_ID() AS connection_id,@@in_transaction AS active');
    if(!$state||(int)$state->connection_id!==$connection||(int)$state->active!==1)throw new RuntimeException('Transaction connection lost');
    remove_filter('query','duanap_hub_checkin_sql_guard',PHP_INT_MIN);$guard=false;
    if($wpdb->query('COMMIT')===false||mysqli_thread_id($wpdb->dbh)!==$connection)throw new RuntimeException('Commit not confirmed');
}
function duanap_hub_checkin_pending($status,$date) {
    return ['status'=>$status,'business_date'=>$date,'timezone'=>'Asia/Shanghai','as_of'=>gmdate('c')];
}
function duanap_hub_checkin($id,$date,$source='blog') {
    global $wpdb;$lock='dh-checkin-'.(int)$id;$locked=false;$transaction=false;$guard=false;
    $wpdb->suppress_errors(true);
    try{
        $ready=duanap_hub_checkin_ready();if(is_wp_error($ready))return $ready;
        if(!duanap_hub_checkin_valid_date($date))return new WP_Error('hub_invalid_date','日期无效。',['status'=>400]);
        if(!in_array($source,['blog','hub'],true))return new WP_Error('hub_invalid_source','入口无效。',['status'=>400]);
        if($date!==duanap_hub_checkin_date())return new WP_Error('hub_checkin_date_changed','签到日期已变化，请刷新后操作。',['status'=>409]);
        $locked=(string)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,0)',$lock))==='1';
        if(!$locked){if($wpdb->last_error)throw new RuntimeException('Lock unavailable');return duanap_hub_checkin_pending('processing',$date);}
        $connection=mysqli_thread_id($wpdb->dbh);
        if($wpdb->query('START TRANSACTION')===false)throw new RuntimeException('Transaction unavailable');$transaction=true;
        if(mysqli_thread_id($wpdb->dbh)!==$connection)throw new RuntimeException('Transaction connection lost');
        add_filter('query','duanap_hub_checkin_sql_guard',PHP_INT_MIN);$guard=true;
        $user=$wpdb->get_row($wpdb->prepare("SELECT ID,user_status FROM {$wpdb->users} WHERE ID=%d FOR UPDATE",$id));
        if(!$user||(int)$user->user_status!==0)throw new Duanap_Hub_Social_Exception('hub_user_unavailable','账号不可用。',403);
        $wpdb->get_col($wpdb->prepare("SELECT umeta_id FROM {$wpdb->usermeta} WHERE user_id=%d FOR UPDATE",$id));
        if($wpdb->last_error)throw new RuntimeException('Metadata lock unavailable');
        duanap_hub_social_clear_cache($id);
        if(duanap_hub_user_blocked(get_user_by('id',$id)))throw new Duanap_Hub_Social_Exception('hub_user_unavailable','账号不可用。',403);
        $uid=duanap_hub_uid_in_transaction($id);if(is_wp_error($uid))throw new RuntimeException('Identity unavailable');
        $existing=duanap_hub_event($uid,$date);
        if($existing){duanap_hub_checkin_commit($connection,$guard);$transaction=false;return $existing;}
        $before=duanap_hub_checkin_snapshot($id);$was_checked=isset($before['data']['checkin_detail'][$date]);
        $receipt=wp_generate_uuid4();
        if($wpdb->insert($wpdb->prefix.'duanap_hub_events',['receipt'=>$receipt,'hub_uid'=>$uid,'event_type'=>'daily_checkin','business_date'=>$date,'source'=>$source])!==1)throw new RuntimeException('Event claim unavailable');
        if(!$was_checked){
            $native=zib_user_checkin($id);
            if($wpdb->last_error||!is_array($native))throw new RuntimeException('Native checkin failed');
        }
        $after=duanap_hub_checkin_snapshot($id);
        if(duanap_hub_checkin_date()!==$date)throw new Duanap_Hub_Social_Exception('hub_checkin_date_changed','签到期间日期已变化，请刷新后操作。',409);
        if(!isset($after['data']['checkin_detail'][$date])||(!$was_checked&&($after['checkin_all_day']!==$before['checkin_all_day']+1||$after['checkin_continuous_day']<1)))throw new RuntimeException('Native checkin not persisted');
        $points=$after['points']-$before['points'];$integral=$after['level_integral']-$before['level_integral'];
        if($points<0||$integral<0)throw new RuntimeException('Invalid reward');
        if($points){$record=$after['data']['points_record'][0]??null;if(!is_array($record)||(int)($record['value']??0)!==$points||(int)($record['points']??-1)!==$after['points'])throw new RuntimeException('Reward ledger mismatch');}
        $result=['status'=>$was_checked?'already':'success','receipt'=>$receipt,'business_date'=>$date,'timezone'=>'Asia/Shanghai','checked_in'=>true,'continuous_days'=>$after['checkin_continuous_day'],'total_days'=>$after['checkin_all_day'],'balance'=>$after['points'],'points_awarded'=>$points,'integral_awarded'=>$integral,'as_of'=>gmdate('c')];
        if($wpdb->update($wpdb->prefix.'duanap_hub_events',['result_json'=>wp_json_encode($result)],['receipt'=>$receipt])!==1)throw new RuntimeException('Event persistence unavailable');
        duanap_hub_checkin_commit($connection,$guard);
        $transaction=false;return $result;
    }catch(Throwable $error){return $error instanceof Duanap_Hub_Social_Exception?$error->result:new WP_Error('hub_checkin_unavailable','签到未能确认，请查询结果后再决定是否重试。',['status'=>503]);}
    finally{
        if($guard)remove_filter('query','duanap_hub_checkin_sql_guard',PHP_INT_MIN);
        if($transaction)$wpdb->query('ROLLBACK');
        duanap_hub_social_clear_cache($id);
        if($locked)$wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock));
    }
}
function duanap_hub_checkin_result($id,$date) {
    global $wpdb;$lock='dh-checkin-'.(int)$id;$locked=false;$wpdb->suppress_errors(true);
    try{
        $ready=duanap_hub_events_ready();if(is_wp_error($ready))return $ready;
        if(!duanap_hub_checkin_valid_date($date))return new WP_Error('hub_invalid_date','日期无效。',['status'=>400]);
        $locked=(string)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,0)',$lock))==='1';
        if(!$locked){if($wpdb->last_error)throw new RuntimeException('Lock unavailable');return duanap_hub_checkin_pending('processing',$date);}
        $uid=duanap_hub_uid($id);if(is_wp_error($uid))return $uid;
        return duanap_hub_event($uid,$date)??duanap_hub_checkin_pending('not_recorded',$date);
    }catch(Throwable $error){return new WP_Error('hub_checkin_result_unavailable','暂时无法查询签到结果。',['status'=>503]);}
    finally{if($locked)$wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock));}
}
function duanap_hub_checkin_routes() {
    register_rest_route('duanap-hub/v1','/me/checkin',['methods'=>'POST','permission_callback'=>'duanap_hub_read_permission','callback'=>static function($request){return duanap_hub_checkin(duanap_hub_context($request)['user']->ID,$request->get_param('business_date'),'hub');}]);
    register_rest_route('duanap-hub/v1','/me/checkin/result',['methods'=>'GET','permission_callback'=>'duanap_hub_read_permission','callback'=>static function($request){return duanap_hub_checkin_result(duanap_hub_context($request)['user']->ID,$request->get_param('business_date'));}]);
}
function duanap_hub_checkin_native_hooks() {
    if(!defined('DUANAP_HUB_CHECKIN_ENABLED')||DUANAP_HUB_CHECKIN_ENABLED!==true)return;
    remove_action('wp_ajax_user_checkin','zib_ajax_user_checkin');
    add_action('wp_enqueue_scripts',static function(){
        if(!is_user_logged_in())return;
        wp_enqueue_script('duanap-hub-checkin',plugins_url('assets/checkin.js',dirname(__DIR__).'/duanap-hub-bridge.php'),[], '0.3.0',true);
    });
    add_action('wp_footer',static function(){
        if(is_user_logged_in())echo '<script type="application/json" id="duanap-hub-checkin-config">'.wp_json_encode(['nonce'=>wp_create_nonce('user_checkin')],JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT).'</script>';
    },1);
    add_action('wp_ajax_user_checkin',static function(){
        zib_ajax_verify_nonce();
        $result=duanap_hub_checkin(get_current_user_id(),duanap_hub_checkin_date());
        if(is_wp_error($result))wp_send_json(['error'=>true,'msg'=>$result->get_error_message()],$result->get_error_data()['status']??503);
        $complete=in_array($result['status'],['success','already'],true);
        $response=['error'=>!$complete,'msg'=>$complete?($result['status']==='success'?'签到成功':'今日已签到'):'签到处理中，请查询结果','data'=>$result,'continuous_day'=>$result['continuous_days']??0];
        if($complete)$response['details_link']=zib_get_user_checkin_details_link();
        wp_send_json($response,$complete?200:202);
    });
}
