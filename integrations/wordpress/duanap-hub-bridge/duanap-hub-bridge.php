<?php
/**
 * Plugin Name: duanap Hub Bridge
 * Description: Independent Hub identity and protected read-only Zibll APIs.
 * Version: 0.3.1
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 */
defined('ABSPATH') || exit;

require_once __DIR__.'/includes/provider.php';
require_once __DIR__.'/includes/identity.php';
require_once __DIR__.'/includes/permissions.php';
require_once __DIR__.'/includes/zibll-adapter.php';
require_once __DIR__.'/includes/rest-read.php';
require_once __DIR__.'/includes/social-bindings.php';
require_once __DIR__.'/includes/social-routes.php';
require_once __DIR__.'/includes/events.php';
require_once __DIR__.'/includes/cache-policy.php';
require_once __DIR__.'/includes/checkin.php';

register_activation_hook(__FILE__, 'duanap_hub_install_identity');
register_activation_hook(__FILE__, 'duanap_hub_install_social');
register_activation_hook(__FILE__, 'duanap_hub_install_events');
add_action('rest_api_init','duanap_hub_checkin_routes');
add_action('after_setup_theme','duanap_hub_checkin_native_hooks',99);
add_action('deleted_user', 'duanap_hub_retire_identity');
add_action('wo_before_authorize_method', 'duanap_hub_protect_authorization');
add_action('wo_before_token_method', 'duanap_hub_exchange_token');
add_action('rest_api_init', 'duanap_hub_register_reads');
add_filter('rest_post_dispatch', 'duanap_hub_private_response', 10, 3);
add_action('template_redirect','duanap_hub_social_dispatch',4);
add_action('after_setup_theme','duanap_hub_social_native_hooks',99);
add_action('set_logged_in_cookie','duanap_hub_social_login_cookie',10,6);
add_filter('authenticate','duanap_hub_social_password_auth',100,3);
add_action('wp_login','duanap_hub_social_login_verified',100,2);
add_action('deleted_user','duanap_hub_social_user_deleted');
foreach(['add_user_metadata','update_user_metadata','delete_user_metadata'] as $hook)add_filter($hook,'duanap_hub_social_meta_guard',10,3);
