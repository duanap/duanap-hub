<?php
defined('ABSPATH') || exit;

function duanap_hub_install_events() {
    global $wpdb;
    require_once ABSPATH.'wp-admin/includes/upgrade.php';
    $charset=$wpdb->get_charset_collate();
    dbDelta("CREATE TABLE {$wpdb->prefix}duanap_hub_events (
      receipt char(36) NOT NULL,
      hub_uid char(36) NOT NULL,
      event_type varchar(32) NOT NULL,
      business_date date NOT NULL,
      source varchar(16) NOT NULL DEFAULT 'blog',
      result_json longtext DEFAULT NULL,
      PRIMARY KEY  (receipt),
      UNIQUE KEY daily_event (hub_uid,event_type,business_date)
    ) $charset ENGINE=InnoDB;");
}
function duanap_hub_events_ready() {
    global $wpdb;
    $ready=duanap_hub_transactional_tables(true);if(is_wp_error($ready))return $ready;
    $table=$wpdb->prefix.'duanap_hub_events';
    $engine=$wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s',DB_NAME,$table));
    if($wpdb->last_error||$engine!=='InnoDB')return new WP_Error('hub_checkin_storage_unavailable','签到回执存储不可用。',['status'=>503]);
    return true;
}
function duanap_hub_checkin_date($timestamp=null) {
    return (new DateTimeImmutable('@'.($timestamp??time())))->setTimezone(new DateTimeZone('Asia/Shanghai'))->format('Y-m-d');
}
function duanap_hub_checkin_valid_date($date) {
    if(!is_string($date)||!preg_match('/\A\d{4}-\d{2}-\d{2}\z/',$date))return false;
    $parsed=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    return $parsed&&$parsed->format('Y-m-d')===$date;
}
function duanap_hub_event($uid,$date) {
    global $wpdb;
    $value=$wpdb->get_var($wpdb->prepare("SELECT result_json FROM {$wpdb->prefix}duanap_hub_events WHERE hub_uid=%s AND event_type='daily_checkin' AND business_date=%s",$uid,$date));
    if($wpdb->last_error)throw new RuntimeException('Event lookup unavailable');
    if($value===null)return null;
    $result=json_decode($value,true,16,JSON_THROW_ON_ERROR);
    if(!is_array($result)||($result['business_date']??null)!==$date||($result['checked_in']??null)!==true||!is_string($result['receipt']??null))throw new RuntimeException('Invalid event');
    $result['status']='already';
    return $result;
}
