<?php
// Tests core recovery with intercepted mail, never a real mailbox or live user.
if(PHP_SAPI!=='cli'||count($argv)<2)exit(1);
$root=realpath($argv[1]);if(!$root||!is_file($root.'/duanap-hub-fixture.marker')||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
require_once __DIR__.'/fixture-bootstrap.php';$root=duanap_test_bootstrap($root);
$_SERVER['REMOTE_ADDR']='127.0.0.1';$_SERVER['REQUEST_METHOD']='GET';require $root.'/wp-load.php';
duanap_test_sinks();
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_')||wp_parse_url(home_url(),PHP_URL_HOST)!=='127.0.0.1')exit(1);
$checks=[];
function recovery_assert($name,$ok){global $checks;if(!$ok){fwrite(STDERR,'FAIL: '.$name."\n");exit(1);}$checks[]=$name;}
$mail=[];$capture=static function($pre,$message)use(&$mail){$mail[]=$message;return true;};
add_filter('pre_wp_mail',$capture,PHP_INT_MAX,2);
try{
$created=duanap_hub_social_resolve(['provider'=>'qq','app_id'=>'900000001','subject'=>strtoupper(md5(random_bytes(32))),'display_name'=>'合成恢复测试']);
recovery_assert('synthetic social account exists',!is_wp_error($created));$id=$created['user_id'];
$email='recovery-'.bin2hex(random_bytes(12)).'@example.invalid';$updated=wp_update_user(['ID'=>$id,'user_email'=>$email]);
recovery_assert('only an invalid-domain synthetic mailbox used',!is_wp_error($updated));
$user=get_user_by('id',$id);$uid=duanap_hub_uid($id);$old_hash=$user->user_pass;
update_user_meta($id,'points',100);$daily=duanap_hub_checkin($id,duanap_hub_checkin_date());
recovery_assert('recovery starts with committed points history and receipt',!is_wp_error($daily)&&$daily['balance']===105&&count(zib_get_user_meta($id,'points_record',true))===1);
$metadata_before=['openid'=>get_user_meta($id,'oauth_qq_openid',true),'points'=>get_user_meta($id,'points',true),'records'=>zib_get_user_meta($id,'points_record',true),'receipt'=>$daily['receipt']];
recovery_assert('random social password is not a verified fallback',!duanap_hub_social_password_ready($id));
    recovery_assert('core reset request accepts synthetic account',retrieve_password($user->user_login)===true);
    $reset_mail=array_values(array_filter($mail,static fn($message)=>in_array($email,(array)$message['to'],true)));
    // Keep message text and reset keys in memory, never in assertion output.
    $key=null;foreach($reset_mail as $message){
        preg_match_all('~https?://[^\s<>"\']+~',$message['message'],$urls);
        foreach($urls[0] as $url){parse_str(wp_parse_url(html_entity_decode($url),PHP_URL_QUERY)??'',$q);if(($q['action']??'')==='rp'&&isset($q['key'],$q['login']))$key=$q['key'];}
    }
    recovery_assert('reset mail is intercepted before delivery and has a reset link',count($reset_mail)>=1&&is_string($key)&&$key!=='');
    recovery_assert('valid mailed key resolves the same user',($valid=check_password_reset_key($key,$user->user_login)) instanceof WP_User&&$valid->ID===$id);
    recovery_assert('forged key cannot reset the account',is_wp_error(check_password_reset_key('forged-'.bin2hex(random_bytes(12)),$user->user_login)));
    $new_key=get_password_reset_key($user);recovery_assert('new reset request invalidates older mailed key',!is_wp_error($new_key)&&is_wp_error(check_password_reset_key($key,$user->user_login)));
    $expired=static fn()=>-1;add_filter('password_reset_expiration',$expired);
    recovery_assert('expired reset key refused',is_wp_error(check_password_reset_key($new_key,$user->user_login)));remove_filter('password_reset_expiration',$expired);
    $key=get_password_reset_key($user);$cookie=wp_generate_auth_cookie($id,time()+3600,'logged_in');
    recovery_assert('synthetic old cookie initially valid',wp_validate_auth_cookie($cookie,'logged_in')===$id);
    $password=wp_generate_password(48,true,true);reset_password($user,$password);clean_user_cache($id);$current=get_user_by('id',$id);
    recovery_assert('new password is accepted and replaces old hash',wp_check_password($password,$current->user_pass,$id)&&$current->user_pass!==$old_hash);
    recovery_assert('used reset key cannot be replayed',is_wp_error(check_password_reset_key($key,$user->user_login)));
    recovery_assert('old auth cookie rejected after password reset',wp_validate_auth_cookie($cookie,'logged_in')===false);
    recovery_assert('password is not trusted until successful authentication',!duanap_hub_social_password_ready($id));
    $auth=wp_authenticate($user->user_login,$password);recovery_assert('recovered password authenticates the same WordPress user',$auth instanceof WP_User&&$auth->ID===$id);
    $token=WP_Session_Tokens::get_instance($id)->create(time()+3600);
    duanap_hub_social_login_cookie('',0,0,$id,'logged_in',$token);do_action('wp_login',$user->user_login,$auth);
    recovery_assert('successful password login proves the fallback',duanap_hub_social_password_ready($id));
    $stored=duanap_hub_checkin_result($id,duanap_hub_checkin_date());
    $metadata_after=['openid'=>get_user_meta($id,'oauth_qq_openid',true),'points'=>get_user_meta($id,'points',true),'records'=>zib_get_user_meta($id,'points_record',true),'receipt'=>is_wp_error($stored)?null:$stored['receipt']];
    recovery_assert('recovery retains UID native binding and points',duanap_hub_uid($id)===$uid&&$metadata_before===$metadata_after);
}finally{remove_filter('pre_wp_mail',$capture,PHP_INT_MAX);}
echo json_encode(['passed'=>count($checks),'checks'=>$checks,'realMailDelivered'=>false,'productionUserUsed'=>false]);
