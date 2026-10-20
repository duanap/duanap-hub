<?php
/**
 * Plugin Name: duanap QQ Public Callback Compatibility
 * Description: Keep an existing main-domain QQ callback while Zibll owns login.
 * Version: 0.1.1
 * License: GPL-2.0-or-later
 */
defined('ABSPATH') || exit;

function duanap_qq_relay_public_callback($app_id=null) {
    if(!defined('DUANAP_QQ_PUBLIC_CALLBACK')||!is_string(DUANAP_QQ_PUBLIC_CALLBACK)||!function_exists('get_template')||get_template()!=='zibll')return null;
    if(!defined('DUANAP_QQ_PUBLIC_APP_ID')||!is_string(DUANAP_QQ_PUBLIC_APP_ID)||!is_string($app_id)||!hash_equals(DUANAP_QQ_PUBLIC_APP_ID,$app_id))return null;
    $target=wp_parse_url(DUANAP_QQ_PUBLIC_CALLBACK);$home=wp_parse_url(home_url());
    if(!$target||!$home||($target['scheme']??'')!=='https'||empty($target['host'])||($target['path']??'')!=='/oauth/qq/callback'||isset($target['user'])||isset($target['pass'])||isset($target['port'])||isset($target['query'])||isset($target['fragment']))return null;
    $host=strtolower($target['host']);$blog=strtolower($home['host']??'');
    $fixture=defined('DUANAP_HUB_TEST_FIXTURE')&&DUANAP_HUB_TEST_FIXTURE===true&&wp_get_environment_type()==='development'&&$blog==='127.0.0.1';
    if(!$fixture&&(($home['scheme']??'')!=='https'||($blog!==$host&&!str_ends_with($blog,'.'.$host))))return null;
    return DUANAP_QQ_PUBLIC_CALLBACK;
}
function duanap_qq_relay_options($options) {
    if(!is_array($options)||!isset($options['oauth_qq_option'])||!is_array($options['oauth_qq_option']))return $options;
    $callback=duanap_qq_relay_public_callback($options['oauth_qq_option']['appid']??null);
    if(!$callback)return $options;
    if(($options['oauth_agent']??'close')!=='close'||!empty($options['oauth_qq_option']['agent']))return $options;
    // Runtime-only view: use the SAME registered URI for authorization and token
    // exchange. Preserve AppID/AppKey, other platforms, and the stored options.
    $options['oauth_qq_option']['backurl']=$callback;
    return $options;
}
add_filter('option_zibll_options','duanap_qq_relay_options',1);

// The final blog hop is just as sensitive as the public relay.
add_action('init',function(){
    if(!function_exists('get_template')||get_template()!=='zibll')return;
    $path=wp_parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH);
    if($path!==wp_parse_url(home_url('/oauth/qq/callback'),PHP_URL_PATH))return;
    header('Cache-Control: private, no-store',true);
    header('Referrer-Policy: no-referrer',true);
    header('X-Robots-Tag: noindex, nofollow',true);
},0);
