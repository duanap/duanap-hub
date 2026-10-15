<?php
// Real WP database/SDK integration; only explicitly marked synthetic development data.
if(PHP_SAPI!=='cli'||count($argv)<2)exit(1);
$root=realpath($argv[1]);
if(!$root||!is_file($root.'/duanap-hub-fixture.marker')||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
$_SERVER['REMOTE_ADDR']='127.0.0.1';
require $root.'/wp-load.php';
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_'))exit(1);
$passed=[];
function verify_social($name,$condition){global $passed;if(!$condition){fwrite(STDERR,'FAIL: '.$name."\n");exit(1);}$passed[]=$name;}
verify_social('unique social resolver exists',function_exists('duanap_hub_social_resolve'));
duanap_hub_install_social();
global $wpdb;
$nonce=bin2hex(random_bytes(12));
$subject=strtoupper(hash('md5','synthetic-'.$nonce));
$args=['provider'=>'qq','app_id'=>'900000001','subject'=>$subject,'display_name'=>'同名测试','avatar_url'=>''];
wp_set_current_user(0);
$first=duanap_hub_social_resolve($args,0);
verify_social('first verified identity creates one WordPress user',!is_wp_error($first)&&get_user_by('id',$first['user_id'])!==false);
$again=duanap_hub_social_resolve($args,0);
verify_social('repeat identity keeps user and UID',!is_wp_error($again)&&$again['user_id']===$first['user_id']&&$again['hub_uid']===$first['hub_uid']);
$other=$args;$other['subject']=strtoupper(hash('md5','other-'.$nonce));
$second=duanap_hub_social_resolve($other,0);
verify_social('same nickname never merges accounts',!is_wp_error($second)&&$second['user_id']!==$first['user_id']);
$bad=$args;$bad['app_id']='900000009';
verify_social('wrong application cannot resolve',is_wp_error(duanap_hub_social_resolve($bad,0)));
verify_social('no recent actor cannot bind',is_wp_error(duanap_hub_social_resolve(['provider'=>'github','app_id'=>'900000002','subject'=>'999111','display_name'=>'同名测试','avatar_url'=>''],$first['user_id'])));
verify_social('new social-only account has no proven password fallback',!duanap_hub_social_password_ready($first['user_id']));
verify_social('native meta is kept for theme UI',get_user_meta($first['user_id'],'oauth_qq_openid',true)===$subject);
// Simulate a native unlink while the adapter was disabled: no historical claim
// may grant access after the authoritative WordPress binding has been removed.
duanap_hub_social_native($first['user_id'],'qq');
$removed=duanap_hub_social_resolve($args,0);
verify_social('historical claim cannot restore an unlinked login',is_wp_error($removed)&&$removed->get_error_code()==='hub_binding_conflict');
duanap_hub_social_native($first['user_id'],'qq',$subject);
function social_actor($id){
    $user=get_user_by('id',$id);$until=time()+3600;$token=WP_Session_Tokens::get_instance($id)->create($until);
    $_COOKIE[LOGGED_IN_COOKIE]=wp_generate_auth_cookie($id,$until,'logged_in',$token);wp_set_current_user($id);
    duanap_hub_social_login_cookie('',0,$until,$id,'logged_in',$token);duanap_hub_social_login_verified($user->user_login,$user);
}
social_actor($second['user_id']);
verify_social('another account cannot claim owned identity',is_wp_error(duanap_hub_social_resolve($args,$second['user_id'])));
social_actor($first['user_id']);
$github=['provider'=>'github','app_id'=>'900000002','subject'=>(string)(random_int(1000000,9000000)),'display_name'=>'同名测试','avatar_url'=>''];
$bound=duanap_hub_social_resolve($github,$first['user_id']);
verify_social('verified actor binds another platform to same UID',!is_wp_error($bound)&&$bound['user_id']===$first['user_id']&&$bound['hub_uid']===$first['hub_uid']);
// A locally unusable callback must not count as a backup login method.
$callback_reads=0;
$broken_callback=static function($url,$path)use(&$callback_reads){
    if($path==='/oauth/github/callback'&&++$callback_reads%2===1)return 'https://wrong.invalid/callback';
    return $url;
};
add_filter('home_url',$broken_callback,10,2);
try{
    $unusable=duanap_hub_social_unbind($first['user_id'],'qq');
    verify_social('unusable callback cannot permit unlink',is_wp_error($unusable)&&$unusable->get_error_code()==='hub_last_login_method');
}finally{remove_filter('home_url',$broken_callback,10);}
// Emulate another connection publishing its pre-commit snapshot to the cache.
$stale_cache=static function($meta_id,$id,$key){
    if($key!=='oauth_gitee_openid')return;
    wp_cache_set($id,['oauth_gitee_openid'=>['stale-snapshot']],'user_meta');
    wp_cache_set('user_meta_'.$id,['stale'=>true],'zib_option_meta_data');
};
add_action('added_user_meta',$stale_cache,10,3);
add_action('deleted_user_meta',$stale_cache,10,3);
try{
    $gitee=['provider'=>'gitee','app_id'=>'900000003','subject'=>(string)random_int(1000000,9000000),'display_name'=>'缓存测试'];
    $cached=duanap_hub_social_resolve($gitee,$first['user_id']);
    verify_social('cached pre-commit snapshot cannot affect binding',!is_wp_error($cached));
    verify_social('commit invalidates native and theme caches',get_user_meta($first['user_id'],'oauth_gitee_openid',true)===$gitee['subject']&&wp_cache_get('user_meta_'.$first['user_id'],'zib_option_meta_data')===false);
    verify_social('cached pre-commit snapshot cannot affect unbind',duanap_hub_social_unbind($first['user_id'],'gitee')===true);
    verify_social('unbind commit invalidates native and theme caches',get_user_meta($first['user_id'],'oauth_gitee_openid',true)===''&&wp_cache_get('user_meta_'.$first['user_id'],'zib_option_meta_data')===false);
}finally{remove_action('added_user_meta',$stale_cache,10);remove_action('deleted_user_meta',$stale_cache,10);}
verify_social('one provider cannot silently replace existing identity',is_wp_error(duanap_hub_social_resolve($other,$first['user_id'])));
verify_social('one fallback permits other platform unlink',duanap_hub_social_unbind($first['user_id'],'github')===true);
$last=duanap_hub_social_unbind($first['user_id'],'qq');
verify_social('last usable method cannot be removed',is_wp_error($last)&&$last->get_error_code()==='hub_last_login_method');
verify_social('raw native delete cannot bypass protected unbind',delete_user_meta($first['user_id'],'oauth_qq_openid')===false&&get_user_meta($first['user_id'],'oauth_qq_openid',true)===$subject);
$wpdb->query("UPDATE {$wpdb->prefix}duanap_hub_recent_auth SET verified_at=0");
verify_social('stale authentication cannot mutate binding',is_wp_error(duanap_hub_social_unbind($first['user_id'],'qq')));
// Prove a real current password, not the unknown automatically generated one.
$password=wp_generate_password(40,false);wp_set_password($password,$first['user_id']);social_actor($first['user_id']);
$user=get_user_by('id',$first['user_id']);duanap_hub_social_password_auth($user,$user->user_login,$password);
duanap_hub_social_login_cookie('',0,time()+3600,$user->ID,'logged_in',wp_get_session_token());duanap_hub_social_login_verified($user->user_login,$user);
verify_social('verified current password is a fallback',duanap_hub_social_password_ready($user->ID));
verify_social('proven password permits final social unlink',duanap_hub_social_unbind($user->ID,'qq')===true);
$wpdb->query("CREATE TRIGGER hub_fixture_social_failure BEFORE INSERT ON {$wpdb->prefix}duanap_hub_social FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic binding failure'");
try{
    $before=(int)$wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->users}");wp_set_current_user(0);unset($_COOKIE[LOGGED_IN_COOKIE]);
    $fail=$args;$fail['subject']=strtoupper(md5('fault-'.$nonce));$result=duanap_hub_social_resolve($fail,0);
    verify_social('claim write failure is refused',is_wp_error($result));
    verify_social('failed creation leaves no orphan account',(int)$wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->users}")===$before);
}finally{$wpdb->query('DROP TRIGGER IF EXISTS hub_fixture_social_failure');}
$config=duanap_hub_config();$continuation=['client_id'=>$config['client_id'],'redirect_uri'=>$config['callback'],'response_type'=>'code','scope'=>'basic','state'=>str_repeat('a',43),'code_challenge_method'=>'S256','code_challenge'=>str_repeat('b',43)];
verify_social('stored continuation rebuilds only the local authorization route',str_starts_with(duanap_hub_authorization_return(wp_json_encode($continuation)),home_url('/oauth/authorize/').'?'));
$rejected=true;
foreach([['redirect_uri'=>'https://evil.invalid/callback'],['client_id'=>'another-client'],['state'=>[]],['returnTo'=>'https://evil.invalid/']] as $mutation)$rejected=$rejected&&is_wp_error(duanap_hub_authorization_return(wp_json_encode(array_replace($continuation,$mutation))));
verify_social('changed or injected stored continuation cannot redirect the browser',$rejected);
echo json_encode(['passed'=>count($passed),'checks'=>$passed,'productionDataUsed'=>false]);
