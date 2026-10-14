<?php
/**
 * Plugin Name: duanap Hub Bridge
 * Description: Independent Hub identity and protected read-only Zibll APIs.
 * Version: 0.1.0
 * Requires PHP: 8.1
 * License: GPL-2.0-or-later
 */
defined('ABSPATH') || exit;

require_once __DIR__.'/includes/provider.php';
require_once __DIR__.'/includes/identity.php';
require_once __DIR__.'/includes/permissions.php';
require_once __DIR__.'/includes/zibll-adapter.php';
require_once __DIR__.'/includes/rest-read.php';

register_activation_hook(__FILE__, 'duanap_hub_install_identity');
add_action('deleted_user', 'duanap_hub_retire_identity');
add_action('wo_before_authorize_method', 'duanap_hub_protect_authorization');
add_action('wo_before_token_method', 'duanap_hub_exchange_token');
add_action('rest_api_init', 'duanap_hub_register_reads');
add_filter('rest_post_dispatch', 'duanap_hub_private_response', 10, 3);
