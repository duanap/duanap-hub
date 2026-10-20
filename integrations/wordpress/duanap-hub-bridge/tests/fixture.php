<?php
// CLI-only changes to an explicitly marked, synthetic WordPress fixture.
if (PHP_SAPI !== 'cli' || count($argv) < 4) exit(1);
$root = realpath($argv[1]);
if (!$root || !is_file($root.'/duanap-hub-fixture.marker') || trim(file_get_contents($root.'/duanap-hub-fixture.marker')) !== 'isolated') exit(1);
$_SERVER['REMOTE_ADDR']='127.0.0.1';
require $root.'/wp-load.php';
if (!defined('DUANAP_HUB_TEST_FIXTURE') || !DUANAP_HUB_TEST_FIXTURE || wp_get_environment_type() !== 'development' || !str_starts_with(DB_NAME,'hub_p2_audit_')) exit(1);
$action=$argv[2]; $id=(int)$argv[3]; $user=get_user_by('id',$id);
if ($action==='verify') { echo json_encode(['fixture'=>true,'home'=>get_option('home')]);exit; }
if (in_array($action,['social-count','social-clear-union'],true)) {
    $code=$argv[4]??'';if(!preg_match('/\Afixture_[a-z0-9_]{1,100}\z/',$code))exit(1);
    global $wpdb;$subject=strtoupper(md5($code));$key=duanap_hub_social_key('qq','900000001',$subject);
    if($action==='social-clear-union'){
        $owner=$wpdb->get_var($wpdb->prepare("SELECT wp_user_id FROM {$wpdb->prefix}duanap_hub_social WHERE identity_key=%s",$key));
        if(!$owner)exit(1);delete_user_meta((int)$owner,'duanap_hub_qq_union');echo '{"cleared":true}';exit;
    }
    echo json_encode(['claims'=>(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}duanap_hub_social WHERE identity_key=%s AND wp_user_id IS NOT NULL",$key)),'nativeOwners'=>(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(DISTINCT user_id) FROM {$wpdb->usermeta} WHERE meta_key='oauth_qq_openid' AND BINARY meta_value=%s",$subject))]);exit;
}
if ($action==='create') {
    $name='bridge-test-'.wp_generate_password(12,false);
    $password=wp_generate_password(40,false);
    $id=wp_create_user($name,$password,$name.'@example.invalid');
    if (is_wp_error($id)) exit(1);
    echo json_encode(['id'=>$id,'username'=>$name,'password'=>$password]);exit;
}
if ($action==='retired') {
    global $wpdb;
    $uid=$argv[4] ?? '';
    if (!preg_match('/\A[0-9a-f-]{36}\z/',$uid)) exit(1);
    echo json_encode(['retired'=>$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}duanap_hub_identities WHERE hub_uid=%s AND active=0 AND wp_user_id IS NULL",$uid))]);exit;
}
if ($action==='allocate-missing') {
    if ($user) exit(1);
    $result=duanap_hub_uid($id);
    echo json_encode(['rejected'=>is_wp_error($result)]);exit;
}
if (!$user || !str_starts_with($user->user_login,'bridge-')) exit(1);
switch ($action) {
    case 'refresh-read-date':
        // Read-suite data is reused across days; refresh only its marked Alice.
        if($user->user_login!=='bridge-alice')exit(1);
        $data=get_user_meta($id,'zib_other_data',true);if(!is_array($data)||!isset($data['points_record']))exit(1);
        $data['checkin_detail']=[wp_date('Y-m-d')=>['points'=>5,'integral'=>2,'time'=>wp_date('Y-m-d H:i:s')]];
        update_user_meta($id,'zib_other_data',$data);update_user_meta($id,'checkin_continuous_day',3);update_user_meta($id,'checkin_all_day',10);break;
    case 'install':duanap_hub_install_identity();break;
    case 'fail-code-delete':
        if ($wpdb->query("CREATE TRIGGER duanap_hub_fixture_code_failure BEFORE DELETE ON {$wpdb->prefix}oauth_authorization_codes FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic code delete failure'")===false) exit(1);
        break;
    case 'restore-code-delete':$wpdb->query('DROP TRIGGER IF EXISTS duanap_hub_fixture_code_failure');break;
    case 'oauth-counts':echo json_encode(['tokens'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}oauth_access_tokens")]);exit;
    case 'short-tokens':
        $options=get_option('wo_options');
        if (!add_option('duanap_hub_fixture_provider_options',$options,'',false)) exit(1);
        $options['token_length']=12;update_option('wo_options',$options);break;
    case 'restore-provider-options':update_option('wo_options',get_option('duanap_hub_fixture_provider_options'));delete_option('duanap_hub_fixture_provider_options');break;
    case 'unsupported-theme':update_option('template','twentytwentyfive');update_option('stylesheet','twentytwentyfive');break;
    case 'restore-theme':update_option('template','zibll');update_option('stylesheet','zibll');break;
    case 'disable-provider':
        $active=get_option('active_plugins');
        if (!add_option('duanap_hub_fixture_active_plugins',$active,'',false)) exit(1);
        update_option('active_plugins',array_values(array_filter($active,static fn($plugin)=>!str_starts_with($plugin,'oauth2-provider/'))));break;
    case 'restore-provider':update_option('active_plugins',get_option('duanap_hub_fixture_active_plugins'));delete_option('duanap_hub_fixture_active_plugins');break;
    case 'fail-token-write':
        if ($wpdb->query("CREATE TRIGGER duanap_hub_fixture_token_failure BEFORE INSERT ON {$wpdb->prefix}oauth_access_tokens FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Synthetic token write failure'") === false) exit(1);
        break;
    case 'restore-token-write':$wpdb->query('DROP TRIGGER IF EXISTS duanap_hub_fixture_token_failure');break;
    case 'bad-callback':case 'missing-client':
        $path=$root.'/wp-config.php';$source=file_get_contents($path);
        if (is_file($root.'/bridge-fixture-config.backup')) exit(1);
        $pattern=$action==='bad-callback' ? '/^define\(.DUANAP_HUB_REDIRECT_URI.,[^\n]*$/m' : '/^define\(.DUANAP_HUB_CLIENT_ID.,[^\n]*$/m';
        $line=$action==='bad-callback' ? "define('DUANAP_HUB_REDIRECT_URI', 'http://invalid.invalid/callback');" : '// Synthetic missing Hub client constant.';
        $changed=preg_replace($pattern,$line,$source,1,$count);
        if ($count!==1 || file_put_contents($root.'/bridge-fixture-config.backup',$source)===false || file_put_contents($path,$changed)===false) exit(1);
        chmod($root.'/bridge-fixture-config.backup',0600);break;
    case 'restore-callback':
        if (!is_file($root.'/bridge-fixture-config.backup')) exit(1);
        if (file_put_contents($root.'/wp-config.php',file_get_contents($root.'/bridge-fixture-config.backup'))===false) exit(1);
        unlink($root.'/bridge-fixture-config.backup');break;
    case 'nontransactional-tokens':if ($wpdb->query("ALTER TABLE {$wpdb->prefix}oauth_access_tokens ENGINE=MyISAM")===false) exit(1);break;
    case 'restore-token-engine':if ($wpdb->query("ALTER TABLE {$wpdb->prefix}oauth_access_tokens ENGINE=InnoDB")===false) exit(1);break;
    case 'ban': update_user_meta($id,'banned',1); update_user_meta($id,'banned_time',wp_date('Y-m-d H:i:s',time()+3600));break;
    case 'expired-ban': update_user_meta($id,'banned',1);update_user_meta($id,'banned_time',wp_date('Y-m-d H:i:s',time()-3600));break;
    case 'clear-ban':delete_user_meta($id,'banned');delete_user_meta($id,'banned_time');break;
    case 'bad-history':$data=get_user_meta($id,'zib_other_data',true);$data['points_record'][0]['value']='not-a-number';update_user_meta($id,'zib_other_data',$data);break;
    case 'fix-history':$data=get_user_meta($id,'zib_other_data',true);$data['points_record'][0]['value']=5;update_user_meta($id,'zib_other_data',$data);break;
    case 'bad-balance':update_user_meta($id,'points','broken-balance');break;
    case 'fix-balance':update_user_meta($id,'points',100);break;
    case 'delete':require_once ABSPATH.'wp-admin/includes/user.php';wp_delete_user($id);break;
    case 'state':echo json_encode(['balance'=>get_user_meta($id,'points',true),'banned'=>get_user_meta($id,'banned',true)]);exit;
    default:exit(1);
}
echo json_encode(['fixtureAction'=>$action,'success'=>true]);
