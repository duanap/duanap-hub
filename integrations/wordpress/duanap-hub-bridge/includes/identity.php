<?php
defined('ABSPATH') || exit;

function duanap_hub_install_identity() {
    global $wpdb;
    require_once ABSPATH.'wp-admin/includes/upgrade.php';
    $table = $wpdb->prefix.'duanap_hub_identities';
    $charset = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $table (
        hub_uid char(36) NOT NULL,
        wp_user_id bigint(20) unsigned DEFAULT NULL,
        active tinyint(1) NOT NULL DEFAULT 1,
        created_at datetime NOT NULL,
        retired_at datetime DEFAULT NULL,
        PRIMARY KEY  (hub_uid),
        UNIQUE KEY wp_user_id (wp_user_id)
    ) $charset ENGINE=InnoDB;");
    $config=duanap_hub_config();
    if (!is_wp_error($config)) update_option('duanap_hub_client_id',$config['client_id'],false);
}

function duanap_hub_uid($user_id) {
    global $wpdb;
    $table = $wpdb->prefix.'duanap_hub_identities';
    if ((int)$user_id < 1) return new WP_Error('hub_user_unavailable', 'The user is unavailable.', ['status'=>403]);
    $ready=duanap_hub_transactional_tables(true);
    if (is_wp_error($ready)) return $ready;
    if ($wpdb->query('START TRANSACTION') === false) return new WP_Error('hub_identity_unavailable', 'Identity mapping is unavailable.', ['status'=>503]);
    try {
        // Serialize initial allocation and account deletion through the user row.
        $user = $wpdb->get_row($wpdb->prepare("SELECT ID,user_status FROM {$wpdb->users} WHERE ID=%d FOR UPDATE", $user_id), ARRAY_A);
        if (!$user || (int)$user['user_status'] !== 0) {
            $wpdb->query('ROLLBACK');
            return new WP_Error('hub_user_unavailable', 'The user is unavailable.', ['status'=>403]);
        }
        $uid = $wpdb->get_var($wpdb->prepare("SELECT hub_uid FROM $table WHERE wp_user_id=%d AND active=1", $user_id));
        if (!$uid) {
            $wpdb->query($wpdb->prepare("INSERT IGNORE INTO $table (hub_uid,wp_user_id,created_at) VALUES (%s,%d,%s)", wp_generate_uuid4(), $user_id, gmdate('Y-m-d H:i:s')));
            $uid = $wpdb->get_var($wpdb->prepare("SELECT hub_uid FROM $table WHERE wp_user_id=%d AND active=1", $user_id));
        }
        if ($wpdb->last_error || !is_string($uid) || !preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/', $uid) || $wpdb->query('COMMIT') === false) {
            $wpdb->query('ROLLBACK');
            return new WP_Error('hub_identity_unavailable', 'Identity mapping is unavailable.', ['status'=>503]);
        }
        return $uid;
    } catch (Throwable $error) {
        $wpdb->query('ROLLBACK');
        return new WP_Error('hub_identity_unavailable', 'Identity mapping is unavailable.', ['status'=>503]);
    }
}

function duanap_hub_retire_identity($user_id) {
    global $wpdb;
    $wpdb->query($wpdb->prepare("UPDATE {$wpdb->prefix}duanap_hub_identities SET wp_user_id=NULL,active=0,retired_at=%s WHERE wp_user_id=%d", gmdate('Y-m-d H:i:s'), $user_id));
}

function duanap_hub_user_blocked($user) {
    if ((int)$user->user_status !== 0 || !empty($user->spam) || !empty($user->deleted)) return true;
    if (!get_user_meta($user->ID, 'banned', true)) return false;
    $until = get_user_meta($user->ID, 'banned_time', true);
    if (!$until) return true;
    if (!is_string($until)) return true;
    $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', (string)$until, wp_timezone());
    if (!$date || $date->format('Y-m-d H:i:s') !== $until) return true;
    return $date->getTimestamp() >= time();
}
