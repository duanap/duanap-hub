<?php
defined('ABSPATH') || exit;

function duanap_hub_register_reads() {
    foreach (['/me','/me/points','/me/checkin','/me/points/history','/me/bindings'] as $path) register_rest_route('duanap-hub/v1', $path, ['methods'=>'GET','permission_callback'=>'duanap_hub_read_permission','callback'=>'duanap_hub_read_response']);
}

function duanap_hub_read_response($request) {
    $context = duanap_hub_context($request);
    if (!$context) return new WP_Error('hub_unauthenticated', 'Authentication required.', ['status'=>401]);
    if($request->get_route()==='/duanap-hub/v1/me/bindings'){
        if(!defined('DUANAP_HUB_SOCIAL_ENABLED')||DUANAP_HUB_SOCIAL_ENABLED!==true)return new WP_Error('hub_social_disabled','绑定功能未启用。',['status'=>503]);
        return duanap_hub_social_status($context['user']->ID);
    }
    if ($request->get_route() !== '/duanap-hub/v1/me') return duanap_hub_read_business($request);
    $user = $context['user'];
    $uid = duanap_hub_uid($user->ID);
    if (is_wp_error($uid)) return $uid;
    $profile=['hub_uid'=>$uid, 'display_name'=>(string)$user->display_name, 'avatar_url'=>esc_url_raw(get_avatar_url($user->ID), ['http','https']), 'as_of'=>gmdate('c')];
    $union=duanap_hub_qq_union_read($user->ID);
    if($union)$profile['qq_union']=$union;
    return $profile;
}

function duanap_hub_private_response($response, $server, $request) {
    if (str_starts_with($request->get_route(), '/duanap-hub/v1/')) {
        $response->header('Cache-Control','private, no-store');
        $response->header('X-Robots-Tag','noindex, nofollow');
        $response->header('Vary','Authorization');
    }
    return $response;
}
