<?php
defined('ABSPATH') || exit;

// Native admin_init login rewards touch the same metadata as checkin. Keep
// their original callbacks/rules, but serialize their complete transaction.
function duanap_hub_login_reward_hooks(){
    if(!defined('DUANAP_HUB_CHECKIN_ENABLED')||DUANAP_HUB_CHECKIN_ENABLED!==true)return;
    $callbacks=[];
    foreach(($GLOBALS['wp_filter']['admin_init']->callbacks??[]) as $priority=>$entries)foreach($entries as $entry){
        $f=$entry['function'];
        if(is_array($f)&&is_object($f[0])&&$f[1]==='sign_in'&&in_array(get_class($f[0]),['zibpay_points_free_add','zib_user_level_integral_add'],true)){
            $callbacks[]=$f;remove_action('admin_init',$f,$priority);
        }
    }
    $GLOBALS['duanap_hub_login_rewards']=$callbacks;
    add_action('admin_init','duanap_hub_login_rewards',1);
}
function duanap_hub_login_rewards(){
    global $wpdb;
    $id=get_current_user_id();if(!$id)return;
    $callbacks=$GLOBALS['duanap_hub_login_rewards']??[];
    if(!$callbacks)return;
    // No unsafe reward is delegated, but settings must remain reachable so an
    // administrator can repair storage/configuration. AJAX does not claim a reward.
    if(!duanap_hub_login_rewards_ready($callbacks)){
        add_action('admin_notices',static function(){echo '<div class="notice notice-warning"><p>登录奖励因存储或主题配置未通过检查而暂停；请检查 Bridge 配置。</p></div>';});
        return;
    }
    $locked=false;$transaction=false;$guard=false;$failure=false;$lock='dh-checkin-'.$id;
    $wpdb->suppress_errors(true);
    try{
        $locked=(string)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,0)',$lock))==='1';
        // Another business request owns this user. Defer the optional login
        // reward; let the existing checkin endpoint report its processing state.
        if(!$locked){if($wpdb->last_error)throw new RuntimeException('Reward lock unavailable');return;}
        $connection=mysqli_thread_id($wpdb->dbh);
        if($wpdb->query('START TRANSACTION')===false)throw new RuntimeException('Reward transaction unavailable');$transaction=true;
        if(mysqli_thread_id($wpdb->dbh)!==$connection)throw new RuntimeException('Reward connection changed');
        add_filter('query','duanap_hub_checkin_sql_guard',PHP_INT_MIN);$guard=true;
        $user=$wpdb->get_row($wpdb->prepare("SELECT ID,user_status FROM {$wpdb->users} WHERE ID=%d FOR UPDATE",$id));
        $wpdb->get_col($wpdb->prepare("SELECT umeta_id FROM {$wpdb->usermeta} WHERE user_id=%d FOR UPDATE",$id));
        if(!$user||(int)$user->user_status!==0||$wpdb->last_error)throw new RuntimeException('Reward user unavailable');
        duanap_hub_social_clear_cache($id);
        if(duanap_hub_user_blocked(get_user_by('id',$id)))throw new RuntimeException('Reward user blocked');
        foreach($callbacks as $callback)call_user_func($callback);
        duanap_hub_checkin_commit($connection,$guard);$transaction=false;
    }catch(Throwable $error){$failure=true;}
    finally{
        if($guard)remove_filter('query','duanap_hub_checkin_sql_guard',PHP_INT_MIN);
        if($transaction)$wpdb->query('ROLLBACK');
        duanap_hub_social_clear_cache($id);
        if($locked)$wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock));
    }
    if($failure){nocache_headers();wp_die('登录奖励暂未确认，请稍后重试。','账号服务',['response'=>503]);}
}
function duanap_hub_login_rewards_ready($callbacks){
    global $wpdb;
    try{
        $names=array_map(static fn($f)=>get_class($f[0]),$callbacks);
        if(count($names)!==count(array_unique($names))||array_diff($names,['zibpay_points_free_add','zib_user_level_integral_add']))return false;
        if(is_wp_error(duanap_hub_zibll_ready())||is_wp_error(duanap_hub_checkin_cache_ready())||!($wpdb->dbh instanceof mysqli)||is_wp_error(duanap_hub_transactional_tables(true)))return false;
        $engine=$wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s',DB_NAME,$wpdb->usermeta));
        return !$wpdb->last_error&&$engine==='InnoDB';
    }catch(Throwable $error){return false;}
}
