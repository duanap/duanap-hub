<?php
// This exact file is installed only as an MU guard in synthetic test roots.
if(!defined('DUANAP_HUB_TEST_FIXTURE')||DUANAP_HUB_TEST_FIXTURE!==true||wp_get_environment_type()!=='development')return;
add_filter('pre_wp_mail',static fn()=>true,PHP_INT_MAX);
add_filter('pre_http_request',static fn()=>new WP_Error('fixture_offline','External fixture HTTP blocked.'),PHP_INT_MAX);
add_action('phpmailer_init',static function(){throw new RuntimeException('Fixture SMTP delivery blocked.');},PHP_INT_MAX);
