<?php
// CLI only. Every connection and mutation must remain in a synthetic database.
if(PHP_SAPI!=='cli'||count($argv)<3)exit(1);
$root=realpath($argv[1]);
require_once __DIR__.'/fixture-bootstrap.php';$root=duanap_test_bootstrap($root?:'');
if(!$root||!is_file($root.'/duanap-hub-fixture.marker')||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
if($argv[2]==='raw-snapshot'){
    $c=json_decode(stream_get_contents(STDIN),true);
    if(!is_array($c)||!preg_match('/\Ahub_p2_audit_[a-f0-9]{6,24}\z/',$c['database']??'')||($c['user']??'')!==$c['database']||($c['host']??'')!=='localhost:/run/mysqld/mysqld.sock')exit(1);
    mysqli_report(MYSQLI_REPORT_OFF);
    $db=@new mysqli('localhost',$c['user'],$c['password'],$c['database'],0,'/run/mysqld/mysqld.sock');
    if($db->connect_errno||!$db->set_charset('utf8mb4')||!$db->query('SET TRANSACTION READ ONLY')||!$db->query('START TRANSACTION WITH CONSISTENT SNAPSHOT'))exit(1);
    $tables=$db->query('SHOW TABLE STATUS');if(!$tables)exit(1);$out=[];
    foreach($tables->fetch_all(MYSQLI_ASSOC) as $table){
        $name=$table['Name'];if(!preg_match('/\A[a-zA-Z0-9_]+\z/',$name)||$table['Engine']!=='InnoDB')exit(1);
        $columns=$db->query("SHOW COLUMNS FROM `$name`");if(!$columns)exit(1);
        $order=implode(',',array_map(static fn($v)=>'`'.str_replace('`','``',$v['Field']).'`',$columns->fetch_all(MYSQLI_ASSOC)));
        $rows=$db->query("SELECT * FROM `$name` ORDER BY $order");if(!$rows)exit(1);$rows=$rows->fetch_all(MYSQLI_ASSOC);
        $ddl=$db->query("SHOW CREATE TABLE `$name`");if(!$ddl)exit(1);$ddl=$ddl->fetch_row()[1];
        $out[$name]=['rows'=>count($rows),'sha256'=>hash('sha256',serialize($rows)),'schema'=>hash('sha256',preg_replace('/AUTO_INCREMENT=\d+\s*/','',$ddl))];
    }
    $db->rollback();$db->close();ksort($out);echo json_encode($out);exit;
}
$_SERVER['REMOTE_ADDR']='127.0.0.1';require $root.'/wp-load.php';
duanap_test_sinks();
if(!defined('DUANAP_HUB_TEST_FIXTURE')||DUANAP_HUB_TEST_FIXTURE!==true||wp_get_environment_type()!=='development'||!preg_match('/\Ahub_p2_audit_[a-f0-9]{6,24}\z/',DB_NAME)||wp_parse_url(home_url(),PHP_URL_HOST)!=='127.0.0.1')exit(1);
global $wpdb;$wpdb->suppress_errors(true);$action=$argv[2];
if($action==='connection'){
    if(wp_using_ext_object_cache()||is_multisite())exit(1);
    // Captured in memory by recovery.py; never printed to tool logs or Git.
    echo json_encode(['database'=>DB_NAME,'user'=>DB_USER,'password'=>DB_PASSWORD,'host'=>DB_HOST,'prefix'=>$wpdb->prefix]);exit;
}
if($action==='snapshot'){
    if($wpdb->query('START TRANSACTION WITH CONSISTENT SNAPSHOT')===false)exit(1);
    $tables=$wpdb->get_results('SHOW TABLE STATUS',ARRAY_A);$out=[];
    foreach($tables as $table){
        $name=$table['Name'];if(!preg_match('/\A[a-zA-Z0-9_]+\z/',$name)||$table['Engine']!=='InnoDB')exit(1);
        $columns=$wpdb->get_col("SHOW COLUMNS FROM `$name`");
        $order=implode(',',array_map(static fn($v)=>'`'.str_replace('`','``',$v).'`',$columns));
        $rows=$wpdb->get_results("SELECT * FROM `$name` ORDER BY $order",ARRAY_A);if($wpdb->last_error)exit(1);
        $ddl=$wpdb->get_row("SHOW CREATE TABLE `$name`",ARRAY_N);if($wpdb->last_error||!$ddl)exit(1);
        $out[$name]=['rows'=>count($rows),'sha256'=>hash('sha256',serialize($rows)),'schema'=>hash('sha256',preg_replace('/AUTO_INCREMENT=\d+\s*/','',$ddl[1]))];
    }
    $triggers=$wpdb->get_results('SHOW TRIGGERS',ARRAY_A);
    $wpdb->query('ROLLBACK');if($wpdb->last_error||count($triggers))exit(1);
    ksort($out);echo json_encode($out);exit;
}
if($action==='create'){
    $result=duanap_hub_social_resolve(['provider'=>'qq','app_id'=>'900000001','subject'=>strtoupper(md5(random_bytes(32))),'display_name'=>'隔离备份恢复用户']);
    if(is_wp_error($result))exit(1);$id=$result['user_id'];
    update_user_meta($id,'duanap_hub_recovery_fixture',1);update_user_meta($id,'points',100);
    $daily=duanap_hub_checkin($id,duanap_hub_checkin_date());if(is_wp_error($daily))exit(1);
    $record=['id'=>$id,'receipt'=>$daily['receipt'],'business_date'=>$daily['business_date'],'balance'=>$daily['balance']];
    echo json_encode($record);exit;
}
$id=(int)($argv[3]??0);
if(!$id||get_user_meta($id,'duanap_hub_recovery_fixture',true)!=='1')exit(1);
if($action==='state'){
    $uid=$wpdb->get_var($wpdb->prepare("SELECT hub_uid FROM {$wpdb->prefix}duanap_hub_identities WHERE wp_user_id=%d AND active=1",$id));
    $social=$wpdb->get_col($wpdb->prepare("SELECT identity_key FROM {$wpdb->prefix}duanap_hub_social WHERE wp_user_id=%d ORDER BY identity_key",$id));
    $events=$wpdb->get_results($wpdb->prepare("SELECT receipt,business_date,result_json FROM {$wpdb->prefix}duanap_hub_events WHERE hub_uid=%s ORDER BY business_date",$uid),ARRAY_A);
    echo json_encode(['uid'=>$uid,'social'=>hash('sha256',serialize($social)),'events'=>hash('sha256',serialize($events)),'eventCount'=>count($events),'balance'=>(int)get_user_meta($id,'points',true),'records'=>count(zib_get_user_meta($id,'points_record',true)),'days'=>(int)zib_get_user_checkin_all_day($id)]);exit;
}
if($action==='replay'){
    $r=duanap_hub_checkin($id,duanap_hub_checkin_date());if(is_wp_error($r))exit(1);
    echo json_encode(['status'=>$r['status'],'receipt'=>$r['receipt'],'balance'=>$r['balance']]);exit;
}
if($action==='late-write'){
    $key='duanap_hub_recovery_late_'.$id;
    if(!add_option($key,bin2hex(random_bytes(16)),'',false))exit(1);
    echo json_encode(['recorded'=>true]);exit;
}
if($action==='has-late-write'){echo json_encode(['present'=>get_option('duanap_hub_recovery_late_'.$id)!==false]);exit;}
exit(1);
