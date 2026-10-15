<?php
defined('ABSPATH') || exit;

class Duanap_Hub_Social_Exception extends RuntimeException {
    public $result;
    public function __construct($code,$message,$status=409){parent::__construct($message);$this->result=new WP_Error($code,$message,['status'=>$status]);}
}
function duanap_hub_install_social(){
    global $wpdb;
    require_once ABSPATH.'wp-admin/includes/upgrade.php';
    $charset=$wpdb->get_charset_collate();
    dbDelta("CREATE TABLE {$wpdb->prefix}duanap_hub_social (
      identity_key char(64) NOT NULL,
      provider varchar(16) NOT NULL,
      app_id varchar(191) NOT NULL,
      wp_user_id bigint(20) unsigned DEFAULT NULL,
      created_at datetime NOT NULL,
      PRIMARY KEY  (identity_key),
      UNIQUE KEY user_provider (wp_user_id,provider,app_id)
    ) $charset ENGINE=InnoDB;");
    dbDelta("CREATE TABLE {$wpdb->prefix}duanap_hub_recent_auth (
      token_hash char(64) NOT NULL,
      wp_user_id bigint(20) unsigned NOT NULL,
      verified_at bigint(20) unsigned NOT NULL,
      PRIMARY KEY  (token_hash)
    ) $charset ENGINE=InnoDB;");
    dbDelta("CREATE TABLE {$wpdb->prefix}duanap_hub_social_transactions (
      state_hash char(64) NOT NULL,
      browser_hash char(64) NOT NULL,
      provider varchar(16) NOT NULL,
      app_hash char(64) NOT NULL,
      actor_id bigint(20) unsigned NOT NULL,
      actor_token_hash char(64) NOT NULL,
      expires_at bigint(20) unsigned NOT NULL,
      PRIMARY KEY  (state_hash)
    ) $charset ENGINE=InnoDB;");
}
function duanap_hub_social_config($provider){
    if(!defined('DUANAP_HUB_SOCIAL_ENABLED')||DUANAP_HUB_SOCIAL_ENABLED!==true)throw new Duanap_Hub_Social_Exception('hub_social_disabled','第三方绑定尚未启用。',503);
    if(!in_array($provider,['qq','github','gitee'],true)||is_wp_error(duanap_hub_zibll_ready())||!function_exists('get_oauth_config'))throw new Duanap_Hub_Social_Exception('hub_social_unavailable','当前主题不支持此绑定适配。',503);
    $config=get_oauth_config($provider);
    if(!_pz('oauth_'.$provider.'_s')||!is_string($config['appid'])||!preg_match('/\A[A-Za-z0-9_-]{1,191}\z/',$config['appid'])||!is_string($config['appkey'])||strlen($config['appkey'])<16||!empty($config['agent'])||_pz('oauth_agent','close')!=='close')throw new Duanap_Hub_Social_Exception('hub_social_unconfigured','第三方应用未配置或代理模式不受支持。',503);
    $local=defined('DUANAP_HUB_TEST_FIXTURE')&&DUANAP_HUB_TEST_FIXTURE&&wp_get_environment_type()==='development'&&wp_parse_url(home_url(),PHP_URL_HOST)==='127.0.0.1';
    $expected=home_url('/oauth/'.$provider.'/callback');
    if($provider==='qq'&&function_exists('duanap_qq_relay_public_callback'))$expected=duanap_qq_relay_public_callback($config['appid'])??$expected;
    if($config['backurl']!==$expected||(!$local&&wp_parse_url($config['backurl'],PHP_URL_SCHEME)!=='https'))throw new Duanap_Hub_Social_Exception('hub_callback_unavailable','回调必须为本站准确 HTTPS 地址。',503);
    if(!class_exists(duanap_hub_social_sdk_class($provider)))throw new Duanap_Hub_Social_Exception('hub_sdk_unavailable','主题 OAuth SDK 不可用。',503);
    return $config;
}
function duanap_hub_social_ready(){
    global $wpdb;
    $ready=duanap_hub_transactional_tables(true);
    if(is_wp_error($ready))throw new Duanap_Hub_Social_Exception('hub_storage_unavailable','绑定存储暂不可用。',503);
    foreach([$wpdb->usermeta,$wpdb->prefix.'duanap_hub_social',$wpdb->prefix.'duanap_hub_recent_auth',$wpdb->prefix.'duanap_hub_social_transactions'] as $table){
        $engine=$wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s',DB_NAME,$table));
        if($wpdb->last_error||$engine!=='InnoDB')throw new Duanap_Hub_Social_Exception('hub_storage_unavailable','绑定表必须支持事务。',503);
    }
}
function duanap_hub_social_key($provider,$app,$subject){
    if(!is_string($subject)||($provider==='qq'?!preg_match('/\A[0-9A-Fa-f]{32}\z/',$subject):!preg_match('/\A[1-9][0-9]{0,19}\z/',$subject)))throw new Duanap_Hub_Social_Exception('hub_invalid_subject','第三方身份格式无效。',400);
    return hash('sha256',$provider."\0".$app."\0".$subject);
}
function duanap_hub_social_password_ready($id){
    $user=get_user_by('id',$id);$record=get_user_meta($id,'duanap_hub_password_proven',true);
    return $user&&is_string($record)&&hash_equals(hash('sha256',$user->user_pass),$record);
}
function duanap_hub_social_recent($id){
    global $wpdb;
    if(get_current_user_id()!==$id||!$id)return false;
    $token=wp_get_session_token();if(!$token||!WP_Session_Tokens::get_instance($id)->get($token))return false;
    return (bool)$wpdb->get_var($wpdb->prepare("SELECT 1 FROM {$wpdb->prefix}duanap_hub_recent_auth WHERE token_hash=%s AND wp_user_id=%d AND verified_at>%d",hash('sha256',$token),$id,time()-300));
}
function duanap_hub_social_native($id,$provider,$subject=null){
    $GLOBALS['duanap_hub_social_write']=$id.':oauth_'.$provider.'_openid';
    try{return $subject===null?delete_user_meta($id,'oauth_'.$provider.'_openid'):update_user_meta($id,'oauth_'.$provider.'_openid',$subject);}
    finally{unset($GLOBALS['duanap_hub_social_write']);}
}
// Transaction checks read the owning connection, never a shared object cache.
function duanap_hub_social_native_value($id,$provider){
    global $wpdb;
    $values=$wpdb->get_col($wpdb->prepare("SELECT meta_value FROM {$wpdb->usermeta} WHERE user_id=%d AND meta_key=%s",$id,'oauth_'.$provider.'_openid'));
    if($wpdb->last_error||count($values)>1)throw new RuntimeException('Native binding lookup unavailable');
    return $values[0]??'';
}
function duanap_hub_social_clear_cache($id){
    clean_user_cache($id);
    wp_cache_delete($id,'user_meta');
    wp_cache_delete('user_meta_'.$id,'zib_option_meta_data');
}
function duanap_hub_social_meta_guard($check,$id,$key){
    if(defined('DUANAP_HUB_SOCIAL_ENABLED')&&DUANAP_HUB_SOCIAL_ENABLED===true&&preg_match('/\Aoauth_(qq|github|gitee)_openid\z/',$key)&&($GLOBALS['duanap_hub_social_write']??'')!==$id.':'.$key)return false;
    return $check;
}
function duanap_hub_social_login_cookie($cookie,$expire,$expiration,$id,$scheme,$token){$GLOBALS['duanap_hub_new_login']=['id'=>(int)$id,'token'=>$token];}
function duanap_hub_social_password_auth($user,$username,$password){
    if($user instanceof WP_User&&is_string($password)&&$password!==''&&wp_check_password($password,$user->user_pass,$user->ID))$GLOBALS['duanap_hub_password_login']=(int)$user->ID;
    return $user;
}
function duanap_hub_social_login_verified($name,$user){
    if(!defined('DUANAP_HUB_SOCIAL_ENABLED')||DUANAP_HUB_SOCIAL_ENABLED!==true)return;
    global $wpdb;
    $login=$GLOBALS['duanap_hub_new_login']??null;
    if(!$login||$login['id']!==(int)$user->ID)return;
    $wpdb->suppress_errors(true);
    $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->prefix}duanap_hub_recent_auth WHERE verified_at<%d",time()-300));
    $wpdb->replace($wpdb->prefix.'duanap_hub_recent_auth',['token_hash'=>hash('sha256',$login['token']),'wp_user_id'=>$user->ID,'verified_at'=>time()]);
    if(($GLOBALS['duanap_hub_password_login']??0)===(int)$user->ID)update_user_meta($user->ID,'duanap_hub_password_proven',hash('sha256',$user->user_pass));
    unset($GLOBALS['duanap_hub_new_login'],$GLOBALS['duanap_hub_password_login']);
}
function duanap_hub_social_resolve($args,$actor=0){
    global $wpdb;
    $lock='';$new_id=0;$cache_id=0;
    $wpdb->suppress_errors(true);
    try{
        $provider=$args['provider']??'';$config=duanap_hub_social_config($provider);duanap_hub_social_ready();
        if(($args['app_id']??null)!==$config['appid'])throw new Duanap_Hub_Social_Exception('hub_wrong_app','应用标识已变化。',409);
        $subject=$args['subject']??null;$key=duanap_hub_social_key($provider,$config['appid'],$subject);
        if($actor&&!duanap_hub_social_recent($actor))throw new Duanap_Hub_Social_Exception('hub_reauth_required','绑定前请重新验证博客账号。',403);
        $lock='dh-social-'.substr($key,0,54);
        if((string)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,3)',$lock))!=='1')throw new Duanap_Hub_Social_Exception('hub_social_busy','绑定正在处理中，请重试。',503);
        if($wpdb->query('START TRANSACTION')===false)throw new RuntimeException('Transaction unavailable');
        $row=$wpdb->get_row($wpdb->prepare("SELECT wp_user_id FROM {$wpdb->prefix}duanap_hub_social WHERE identity_key=%s FOR UPDATE",$key),ARRAY_A);
        if($wpdb->last_error)throw new RuntimeException('Identity lookup unavailable');
        $id=$row?(int)$row['wp_user_id']:0;
        if($id&&$actor&&$actor!==$id)throw new Duanap_Hub_Social_Exception('hub_binding_conflict','此身份已被另一账号绑定。');
        if($id){
            $wpdb->get_var($wpdb->prepare("SELECT ID FROM {$wpdb->users} WHERE ID=%d FOR UPDATE",$id));
            $owners=$wpdb->get_col($wpdb->prepare("SELECT DISTINCT user_id FROM {$wpdb->usermeta} WHERE meta_key=%s AND BINARY meta_value=%s FOR UPDATE",'oauth_'.$provider.'_openid',$subject));
            if($wpdb->last_error)throw new RuntimeException('Native ownership lookup unavailable');
            if(duanap_hub_social_native_value($id,$provider)!==$subject||count($owners)!==1||(int)$owners[0]!==$id)throw new Duanap_Hub_Social_Exception('hub_binding_conflict','原生绑定与历史记录不一致，需人工核实。');
        }
        if(!$id){
            $legacy=$wpdb->get_col($wpdb->prepare("SELECT DISTINCT user_id FROM {$wpdb->usermeta} WHERE meta_key=%s AND BINARY meta_value=%s FOR UPDATE",'oauth_'.$provider.'_openid',$subject));
            if($wpdb->last_error)throw new RuntimeException('Legacy lookup unavailable');
            if($legacy){
                $known=defined('DUANAP_HUB_SOCIAL_LEGACY_APPS')?DUANAP_HUB_SOCIAL_LEGACY_APPS:[];
                if(count($legacy)!==1||!is_array($known)||($known[$provider]??'')!==$config['appid'])throw new Duanap_Hub_Social_Exception('hub_legacy_review_required','已有绑定缺少可信应用来源，需人工核实；不会重建或合并账号。');
                $id=(int)$legacy[0];if($actor&&$actor!==$id)throw new Duanap_Hub_Social_Exception('hub_binding_conflict','此身份已被另一账号绑定。');
            }elseif($actor)$id=$actor;
            else{
                $name='hub_'.bin2hex(random_bytes(12));
                $id=wp_create_user($name,wp_generate_password(64,true,true));
                if(is_wp_error($id))throw new RuntimeException('User creation unavailable');
                $new_id=(int)$id;
                update_user_meta($id,'oauth_new',$provider);
                update_user_meta($id,'duanap_hub_social_created',1);
                $display=is_string($args['display_name']??null)?sanitize_text_field($args['display_name']):'';
                if($display)wp_update_user(['ID'=>$id,'display_name'=>mb_substr($display,0,250)]);
            }
            $cache_id=$id;
            $user=$wpdb->get_row($wpdb->prepare("SELECT ID,user_status FROM {$wpdb->users} WHERE ID=%d FOR UPDATE",$id));
            if(!$user||(int)$user->user_status!==0)throw new Duanap_Hub_Social_Exception('hub_user_unavailable','账号不可用。',403);
            $other=$wpdb->get_var($wpdb->prepare("SELECT identity_key FROM {$wpdb->prefix}duanap_hub_social WHERE wp_user_id=%d AND provider=%s AND app_id=%s FOR UPDATE",$id,$provider,$config['appid']));
            $native=duanap_hub_social_native_value($id,$provider);
            if(($other&&$other!==$key)||($native&&$native!==$subject))throw new Duanap_Hub_Social_Exception('hub_binding_conflict','该账号已绑定此平台的其他身份。');
            $query=$row?$wpdb->prepare("UPDATE {$wpdb->prefix}duanap_hub_social SET wp_user_id=%d WHERE identity_key=%s AND wp_user_id IS NULL",$id,$key):$wpdb->prepare("INSERT INTO {$wpdb->prefix}duanap_hub_social VALUES (%s,%s,%s,%d,%s)",$key,$provider,$config['appid'],$id,gmdate('Y-m-d H:i:s'));
            if($wpdb->query($query)!==1)throw new RuntimeException('Claim persistence unavailable');
            duanap_hub_social_native($id,$provider,$subject);
            if($wpdb->last_error||duanap_hub_social_native_value($id,$provider)!==$subject)throw new RuntimeException('Native binding persistence unavailable');
        }
        $cache_id=$id;$user=get_user_by('id',$id);
        if(!$user||duanap_hub_user_blocked($user))throw new Duanap_Hub_Social_Exception('hub_user_unavailable','账号不可用。',403);
        $uid=duanap_hub_uid_in_transaction($id);
        if(is_wp_error($uid)||$wpdb->query('COMMIT')===false)throw new RuntimeException('Identity commit unavailable');
        duanap_hub_social_clear_cache($id);
        return ['user_id'=>(int)$id,'hub_uid'=>$uid,'created'=>(bool)$new_id];
    }catch(Throwable $error){
        $wpdb->query('ROLLBACK');
        if($cache_id)duanap_hub_social_clear_cache($cache_id);
        return $error instanceof Duanap_Hub_Social_Exception?$error->result:new WP_Error('hub_social_unavailable','第三方身份处理暂不可用。',['status'=>503]);
    }finally{if($lock)$wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock));}
}
function duanap_hub_social_status($id){
    global $wpdb;$providers=[];
    foreach(['qq'=>'QQ','github'=>'GitHub','gitee'=>'Gitee'] as $provider=>$name){
        $configured=false;$linked=false;$legacy=false;
        try{
            $config=duanap_hub_social_config($provider);duanap_hub_social_ready();$configured=true;
            $key=$wpdb->get_var($wpdb->prepare("SELECT identity_key FROM {$wpdb->prefix}duanap_hub_social WHERE wp_user_id=%d AND provider=%s AND app_id=%s",$id,$provider,$config['appid']));
            $native=duanap_hub_social_native_value($id,$provider);
            $linked=is_string($native)&&$native!==''&&$key===duanap_hub_social_key($provider,$config['appid'],$native);
            $legacy=(bool)$native&&!$linked;
        }catch(Throwable $error){}
        $providers[]=['provider'=>$provider,'name'=>$name,'configured'=>$configured,'linked'=>$linked,'legacy_review'=>$legacy];
    }
    return ['providers'=>$providers,'password_ready'=>(bool)duanap_hub_social_password_ready($id),'management_url'=>home_url('/hub-account-bindings'),'recovery_url'=>wp_lostpassword_url(home_url('/hub-account-bindings')),'as_of'=>gmdate('c')];
}
function duanap_hub_social_unbind($id,$provider){
    global $wpdb;$lock='dh-social-user-'.(int)$id;$wpdb->suppress_errors(true);
    try{
        $config=duanap_hub_social_config($provider);duanap_hub_social_ready();
        if(!duanap_hub_social_recent($id))throw new Duanap_Hub_Social_Exception('hub_reauth_required','解绑前请重新验证博客账号。',403);
        if((string)$wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s,3)',$lock))!=='1')throw new RuntimeException('Busy');
        if($wpdb->query('START TRANSACTION')===false)throw new RuntimeException('Transaction unavailable');
        $wpdb->get_var($wpdb->prepare("SELECT ID FROM {$wpdb->users} WHERE ID=%d FOR UPDATE",$id));
        $status=duanap_hub_social_status($id);$linked=array_filter($status['providers'],static fn($p)=>$p['linked']);
        $current=array_filter($linked,static fn($p)=>$p['provider']===$provider);
        if(!$current)throw new Duanap_Hub_Social_Exception('hub_binding_missing','此绑定不存在或需要先核实来源。');
        if(count($linked)<=1&&!$status['password_ready'])throw new Duanap_Hub_Social_Exception('hub_last_login_method','不能解绑最后一种登录方式，请先设置并验证备用密码或绑定另一平台。');
        if($wpdb->query($wpdb->prepare("UPDATE {$wpdb->prefix}duanap_hub_social SET wp_user_id=NULL WHERE wp_user_id=%d AND provider=%s AND app_id=%s",$id,$provider,$config['appid']))!==1)throw new RuntimeException('Unbind unavailable');
        duanap_hub_social_native($id,$provider);
        if($wpdb->last_error||duanap_hub_social_native_value($id,$provider))throw new RuntimeException('Native unbind unavailable');
        if($wpdb->query('COMMIT')===false)throw new RuntimeException('Commit unavailable');
        duanap_hub_social_clear_cache($id);
        return true;
    }catch(Throwable $error){$wpdb->query('ROLLBACK');duanap_hub_social_clear_cache($id);return $error instanceof Duanap_Hub_Social_Exception?$error->result:new WP_Error('hub_social_unavailable','解绑暂不可用。',['status'=>503]);}
    finally{$wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)',$lock));}
}
function duanap_hub_social_user_deleted($id){
    global $wpdb;
    $wpdb->update($wpdb->prefix.'duanap_hub_social',['wp_user_id'=>null],['wp_user_id'=>$id]);
    $wpdb->delete($wpdb->prefix.'duanap_hub_recent_auth',['wp_user_id'=>$id]);
}
