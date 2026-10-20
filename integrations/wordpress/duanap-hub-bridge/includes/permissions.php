<?php
defined('ABSPATH') || exit;

function duanap_hub_context($request, $value=null) {
    static $contexts;
    $contexts ??= new WeakMap();
    if ($value !== null) $contexts[$request] = $value;
    return $contexts[$request] ?? null;
}

function duanap_hub_read_permission($request) {
    $header = $request->get_header('authorization');
    if (!is_string($header) || !preg_match('/\ABearer [A-Za-z0-9._~-]{20,2048}\z/i', $header)) return new WP_Error('hub_unauthenticated', 'A user access token is required.', ['status'=>401]);
    global $wpdb;
    $wpdb->suppress_errors(true);
    $config = duanap_hub_config();
    if (is_wp_error($config)) return $config;
    $ready = duanap_hub_provider_ready();
    if (is_wp_error($ready)) return $ready;
    $server = new WPOAuth2\Server(new WPOAuth2\Storage\Wordpressdb());
    $resource = $server->getResourceController();
    $response = new WPOAuth2\Response();
    if (!$resource->verifyResourceRequest(WPOAuth2\Request::createFromGlobals(), $response, 'basic')) return new WP_Error('hub_invalid_token', 'The access token is invalid or expired.', ['status'=>$response->getStatusCode() === 403 ? 403 : 401]);
    $token = $resource->getToken();
    if (($token['client_id'] ?? '') !== $config['client_id']) return new WP_Error('hub_wrong_client', 'This token is not authorized for Hub.', ['status'=>403]);
    $id = $token['user_id'] ?? null;
    if ((!is_int($id) && (!is_string($id) || !ctype_digit($id))) || (int)$id < 1) return new WP_Error('hub_user_required', 'A user authorization is required.', ['status'=>403]);
    $user = get_user_by('id', (int)$id);
    if (!$user || duanap_hub_user_blocked($user)) return new WP_Error('hub_user_unavailable', 'The user is unavailable.', ['status'=>403]);
    foreach (['user_id','hub_uid','uid','access_token','token'] as $key) if ($request->has_param($key)) return new WP_Error('hub_identity_override', 'Identity and tokens must not be supplied as request parameters.', ['status'=>400]);
    duanap_hub_context($request, ['user'=>$user]);
    return true;
}
