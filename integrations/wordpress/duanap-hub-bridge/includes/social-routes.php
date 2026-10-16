<?php
defined('ABSPATH') || exit;

function duanap_hub_social_sdk_class($provider){
    $classes=['qq'=>'Yurun\\OAuthLogin\\QQ\\OAuth2','github'=>'Yurun\\OAuthLogin\\Github\\OAuth2','gitee'=>'Yurun\\OAuthLogin\\Gitee\\OAuth2'];
    return $classes[$provider];
}
function duanap_hub_social_sdk($provider,$config){
    $class=duanap_hub_social_sdk_class($provider);
    if(!class_exists($class))throw new Duanap_Hub_Social_Exception('hub_sdk_unavailable','主题 OAuth SDK 不可用。',503);
    $sdk=new $class($config['appid'],$config['appkey'],$config['backurl']);
    $sdk->http->timeout(5000);
    // Server-side transport seam; no request parameter can replace SDK verification.
    $sdk->http=apply_filters('duanap_hub_social_http',$sdk->http,$provider);
    return $sdk;
}
function duanap_hub_social_session(){
    if(session_status()!==PHP_SESSION_ACTIVE){
        session_set_cookie_params(['httponly'=>true,'secure'=>is_ssl(),'samesite'=>'Lax','path'=>'/']);
        if(!session_start())throw new Duanap_Hub_Social_Exception('hub_session_unavailable','浏览器授权会话不可用。',503);
    }
    return hash('sha256',session_id());
}
function duanap_hub_social_app_hash($config){return hash('sha256',wp_json_encode([$config['appid'],$config['appkey'],$config['backurl']]));}
function duanap_hub_social_flow($provider,$callback,$authorization=null){
    global $wpdb;
    $config=duanap_hub_social_config($provider);duanap_hub_social_ready();
    $browser=duanap_hub_social_session();$actor=get_current_user_id();$token=wp_get_session_token();$wpdb->suppress_errors(true);
    if(!empty($_SESSION['agent_back_url']))throw new Duanap_Hub_Social_Exception('hub_agent_unsupported','当前适配不支持代理回跳。',503);
    if(!$callback){
        $continuation=duanap_hub_authorization_return($authorization);
        if(is_wp_error($continuation))throw new Duanap_Hub_Social_Exception('hub_invalid_continuation','主站授权请求无效。',400);
        if($actor){
            if(!duanap_hub_social_recent($actor))throw new Duanap_Hub_Social_Exception('hub_reauth_required','请先在博客重新登录，再绑定平台。',403);
            if(!wp_verify_nonce($_GET['_hub_nonce']??'','hub_bind_'.$provider))throw new Duanap_Hub_Social_Exception('hub_invalid_nonce','绑定请求校验失败。',403);
        }
        $state=bin2hex(random_bytes(32));
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->prefix}duanap_hub_social_transactions WHERE expires_at<%d",time()));
        $count=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}duanap_hub_social_transactions WHERE browser_hash=%s",$browser));
        if($count>=8)throw new Duanap_Hub_Social_Exception('hub_social_limit','授权请求过多，请稍后再试。',429);
        if($wpdb->insert($wpdb->prefix.'duanap_hub_social_transactions',['state_hash'=>hash('sha256',$state),'browser_hash'=>$browser,'provider'=>$provider,'app_hash'=>duanap_hub_social_app_hash($config),'actor_id'=>$actor,'actor_token_hash'=>hash('sha256',$token),'expires_at'=>time()+300,'authorization_query'=>$authorization])!==1)throw new Duanap_Hub_Social_Exception('hub_storage_unavailable','授权记录不可用。',503);
        $sdk=duanap_hub_social_sdk($provider,$config);
        $url=$sdk->getAuthUrl(null,$state);
        session_write_close();wp_redirect($url,302);exit;
    }
    $state=$_GET['state']??'';$code=$_GET['code']??'';
    if(!is_string($state)||!preg_match('/\A[0-9a-f]{64}\z/',$state)||!is_string($code)||strlen($code)>1024||$code==='')throw new Duanap_Hub_Social_Exception('hub_invalid_state','授权回调无效。',400);
    $hash=hash('sha256',$state);
    if($wpdb->query('START TRANSACTION')===false)throw new RuntimeException('Unavailable');
    $row=$wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}duanap_hub_social_transactions WHERE state_hash=%s AND browser_hash=%s AND provider=%s AND expires_at>%d FOR UPDATE",$hash,$browser,$provider,time()),ARRAY_A);
    if(!$row){$wpdb->query('ROLLBACK');throw new Duanap_Hub_Social_Exception('hub_invalid_state','授权已失效或已消费。',400);}
    if($wpdb->delete($wpdb->prefix.'duanap_hub_social_transactions',['state_hash'=>$hash])!==1||$wpdb->query('COMMIT')===false){$wpdb->query('ROLLBACK');throw new RuntimeException('Unavailable');}
    session_write_close();
    if($row['app_hash']!==duanap_hub_social_app_hash($config)||(int)$row['actor_id']!==$actor||!hash_equals($row['actor_token_hash'],hash('sha256',$token)))throw new Duanap_Hub_Social_Exception('hub_actor_changed','账号或应用已变化，请重新授权。',403);
    $continuation=duanap_hub_authorization_return($row['authorization_query']??null);
    if(is_wp_error($continuation))throw new Duanap_Hub_Social_Exception('hub_invalid_continuation','主站授权请求已变化，请重新登录。',400);
    $sdk=duanap_hub_social_sdk($provider,$config);$sdk->getAccessToken($state,$code,$state);
    if($provider==='qq'){
        $sdk->getOpenID();
        if((string)($sdk->result['client_id']??'')!==$config['appid'])throw new Duanap_Hub_Social_Exception('hub_wrong_app','第三方返回了错误应用身份。',403);
    }
    $info=$sdk->getUserInfo();
    if(!is_array($info)||!$sdk->openid)throw new Duanap_Hub_Social_Exception('hub_profile_unavailable','第三方身份不可用。',503);
    $union=$provider==='qq'?duanap_hub_qq_union_capture($sdk,$config):null;
    $result=duanap_hub_social_resolve(['provider'=>$provider,'app_id'=>$config['appid'],'subject'=>(string)$sdk->openid,'display_name'=>(string)($info['nickname']??$info['name']??$info['login']??''),'avatar_url'=>(string)($info['figureurl_qq_2']??$info['figureurl_qq_1']??$info['avatar_url']??'')],$actor);
    if(is_wp_error($result))throw new Duanap_Hub_Social_Exception($result->get_error_code(),$result->get_error_message(),$result->get_error_data()['status']??503);
    if($provider==='qq'&&duanap_hub_qq_union_realm()!==''){
        // Remove obsolete proof when permissions/identity change. Only a verified
        // QQ token may create this metadata; never accept a browser-supplied ID.
        if($union)update_user_meta($result['user_id'],'duanap_hub_qq_union',$union);
        else delete_user_meta($result['user_id'],'duanap_hub_qq_union');
    }
    $user=get_user_by('id',$result['user_id']);wp_set_current_user($user->ID);wp_set_auth_cookie($user->ID,false);do_action('wp_login',$user->user_login,$user);
    wp_safe_redirect($continuation??home_url('/hub-account-bindings'));exit;
}
function duanap_hub_social_manager(){
    $expected=$_GET['expect_uid']??'';
    if(!is_string($expected)||($expected!==''&&!preg_match('/\A[0-9a-f-]{36}\z/',$expected)))throw new Duanap_Hub_Social_Exception('hub_invalid_actor','账号校验参数无效。',400);
    $return=$expected?add_query_arg('expect_uid',$expected,home_url('/hub-account-bindings')):home_url('/hub-account-bindings');
    if(!is_user_logged_in()){wp_safe_redirect(wp_login_url($return));exit;}
    status_header(200);nocache_headers();header('Cache-Control: private, no-store');header('X-Robots-Tag: noindex, nofollow');
    $id=get_current_user_id();$message='';
    $uid=duanap_hub_uid($id);
    if(is_wp_error($uid)||($expected&&$uid!==$expected))throw new Duanap_Hub_Social_Exception('hub_actor_changed','当前博客账号与主站账号不同，请切换到对应账号后继续。',403);
    if($_SERVER['REQUEST_METHOD']==='POST'){
        if(!wp_verify_nonce($_POST['_wpnonce']??'','hub_unbind'))throw new Duanap_Hub_Social_Exception('hub_invalid_nonce','请求校验失败。',403);
        $result=duanap_hub_social_unbind($id,is_string($_POST['provider']??null)?$_POST['provider']:'');
        $message=is_wp_error($result)?$result->get_error_message():'已解除绑定。';
    }
    $status=duanap_hub_social_status($id);$recent=duanap_hub_social_recent($id);
    get_header();echo '<main class="container"><h1>账号绑定与恢复</h1><p>'.esc_html(wp_get_current_user()->display_name).' · UID：'.esc_html($uid).'</p><p>绑定与解绑要求最近五分钟内验证博客身份；不会按昵称或邮箱合并账号。</p>';
    if($message)echo '<p role="status">'.esc_html($message).'</p>';
    if(!$recent)echo '<p><a href="'.esc_url(wp_login_url($return,true)).'">重新验证博客账号</a></p>';
    foreach($status['providers'] as $item){echo '<section><h2>'.esc_html($item['name']).'</h2><p>'.($item['legacy_review']?'已有绑定需要核实应用来源':($item['linked']?'已绑定':($item['configured']?'尚未绑定':'应用未配置'))).'</p>';
        if($recent&&$item['configured']&&!$item['legacy_review']){
            if($item['linked']){echo '<form method="post">';wp_nonce_field('hub_unbind');echo '<input type="hidden" name="provider" value="'.esc_attr($item['provider']).'"><button type="submit">确认解绑</button></form>';}
            else echo '<a href="'.esc_url(wp_nonce_url(home_url('/oauth/'.$item['provider']),'hub_bind_'.$item['provider'],'_hub_nonce')).'">绑定'.esc_html($item['name']).'</a>';
        }echo '</section>';
    }
    echo '<p>至少保留一种可用方式；自动生成的社交账号密码不算备用密码。请在博客设置真实密码并重新验证后，再移除最后一个平台。</p><a href="'.esc_url($status['recovery_url']).'">博客密码找回与恢复</a></main>';get_footer();exit;
}
function duanap_hub_social_dispatch(){
    if(!defined('DUANAP_HUB_SOCIAL_ENABLED')||DUANAP_HUB_SOCIAL_ENABLED!==true)return;
    try{
        if(untrailingslashit(wp_parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH))===untrailingslashit(wp_parse_url(home_url('/hub-account-bindings'),PHP_URL_PATH))){duanap_hub_social_session();duanap_hub_social_manager();}
        // Both plugins share the oauth query variable; Provider's broad rewrite
        // captures qq/callback as one value. Match only these exact native paths.
        $path=wp_parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
        $prefix=rtrim((string)wp_parse_url(home_url(),PHP_URL_PATH),'/');
        if(is_string($path)&&preg_match('~\A'.preg_quote($prefix,'~').'/oauth/(qq|github|gitee)(/callback)?/?\z~',$path,$match)){
            nocache_headers();header('Cache-Control: private, no-store');header('X-Robots-Tag: noindex, nofollow');
            duanap_hub_social_flow($match[1],!empty($match[2]));
        }
    }catch(Throwable $error){
        if(!($error instanceof Duanap_Hub_Social_Exception))error_log('[duanap social] '.get_class($error).' '.basename($error->getFile()).':'.$error->getLine());
        $message=$error instanceof Duanap_Hub_Social_Exception?$error->getMessage():'第三方授权暂不可用，请重试。';
        $status=$error instanceof Duanap_Hub_Social_Exception?($error->result->get_error_data()['status']??503):503;
        nocache_headers();header('Cache-Control: private, no-store');header('X-Robots-Tag: noindex, nofollow');wp_die(esc_html($message),'账号授权',['response'=>$status]);
    }
}
function duanap_hub_social_ajax_unbind(){
    if(!defined('DUANAP_HUB_SOCIAL_ENABLED')||DUANAP_HUB_SOCIAL_ENABLED!==true)return;
    zib_ajax_verify_nonce();
    $id=get_current_user_id();if(!$id||!isset($_POST['user_id'])||(string)$_POST['user_id']!==(string)$id)wp_send_json_error(['msg'=>'权限不足。'],403);
    $result=duanap_hub_social_unbind($id,is_string($_POST['type']??null)?$_POST['type']:'');
    wp_send_json(['error'=>is_wp_error($result)?1:0,'msg'=>is_wp_error($result)?$result->get_error_message():'已解除绑定。','reload'=>!is_wp_error($result)]);
}
function duanap_hub_social_native_hooks(){
    if(defined('DUANAP_HUB_SOCIAL_ENABLED')&&DUANAP_HUB_SOCIAL_ENABLED===true){remove_action('wp_ajax_user_oauth_untying','zib_ajax_user_oauth_untying');add_action('wp_ajax_user_oauth_untying','duanap_hub_social_ajax_unbind',1);}
}
