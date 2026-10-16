<?php
defined('ABSPATH') || exit;

function duanap_hub_config() {
    $id = defined('DUANAP_HUB_CLIENT_ID') ? DUANAP_HUB_CLIENT_ID : '';
    $callback = defined('DUANAP_HUB_REDIRECT_URI') ? DUANAP_HUB_REDIRECT_URI : '';
    if (!is_string($id) || !preg_match('/\A[A-Za-z0-9_-]{1,191}\z/', $id) || !is_string($callback)) return new WP_Error('hub_unconfigured', 'Hub identity is not configured.', ['status'=>503]);
    $url = wp_parse_url($callback);
    if (!$url || ($url['scheme'] ?? '') !== 'https' || empty($url['host']) || isset($url['user']) || isset($url['pass']) || isset($url['fragment'])) return new WP_Error('hub_unconfigured', 'Hub callback must be an exact HTTPS URL.', ['status'=>503]);
    return ['client_id'=>$id, 'callback'=>$callback];
}

function duanap_hub_provider_ready() {
    if (!defined('WPOAUTH_VERSION') || WPOAUTH_VERSION !== '4.5.2' || !function_exists('wo_setting') || !wo_setting('enabled') || wo_setting('jwt_bearer_enabled') || wo_setting('use_openid_connect')) return new WP_Error('hub_provider_unavailable', 'The validated OAuth2 provider is unavailable.', ['status'=>503]);
    $length=wo_setting('token_length');
    if ((!is_int($length) && !is_string($length)) || !ctype_digit((string)$length) || (int)$length < 40 || (int)$length > 255) return new WP_Error('hub_provider_unavailable','OAuth access token length must be 40 to 255.',['status'=>503]);
    $tables = duanap_hub_transactional_tables();
    if (is_wp_error($tables)) return $tables;
    $file=WP_PLUGIN_DIR.'/oauth2-provider/library/WPOAuth2/Autoloader.php';
    if (!is_file($file)) return new WP_Error('hub_provider_unavailable','OAuth2 dependencies are unavailable.',['status'=>503]);
    require_once $file;
    WPOAuth2\Autoloader::register();
    return true;
}

function duanap_hub_transactional_tables($identity_only=false) {
    global $wpdb;
    static $checked=[];
    $key=$identity_only ? 'identity' : 'oauth';
    if (isset($checked[$key])) return $checked[$key];
    $tables=[$wpdb->users,$wpdb->prefix.'duanap_hub_identities'];
    if (!$identity_only) array_push($tables,$wpdb->prefix.'oauth_authorization_codes',$wpdb->prefix.'oauth_access_tokens');
    foreach ($tables as $table) {
        $engine=$wpdb->get_var($wpdb->prepare('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s',DB_NAME,$table));
        if ($wpdb->last_error || $engine !== 'InnoDB') return $checked[$key]=new WP_Error('hub_storage_unavailable','Hub storage must support InnoDB transactions.',['status'=>503]);
    }
    return $checked[$key]=true;
}

function duanap_hub_oauth_request() {
    // Use the provider's parser for JSON, Basic and CGI header variants too.
    if (!class_exists('WPOAuth2\\Request')) {
        $file = WP_PLUGIN_DIR.'/oauth2-provider/library/WPOAuth2/Autoloader.php';
        if (!is_file($file)) return null;
        require_once $file;
        WPOAuth2\Autoloader::register();
    }
    return WPOAuth2\Request::createFromGlobals();
}

function duanap_hub_request_client($request) {
    $sources = [$request->query('client_id',''), $request->request('client_id',''), $request->headers('PHP_AUTH_USER','')];
    $clients = [];
    foreach ($sources as $value) {
        if (!is_string($value)) return new WP_Error('invalid_request', 'Invalid client credentials.');
        if ($value !== '') $clients[] = $value;
    }
    if (count(array_unique($clients)) > 1) return new WP_Error('invalid_request', 'Conflicting client credentials.');
    return $clients[0] ?? '';
}

function duanap_hub_owned_request($request) {
    if (!$request) duanap_hub_oauth_error('temporarily_unavailable',503);
    $client = duanap_hub_request_client($request);
    if (is_wp_error($client)) duanap_hub_oauth_error('invalid_request');
    $id = defined('DUANAP_HUB_CLIENT_ID') ? DUANAP_HUB_CLIENT_ID : '';
    $saved = get_option('duanap_hub_client_id','');
    $owners=[];
    foreach ([$id,$saved] as $owner) if (is_string($owner) && preg_match('/\A[A-Za-z0-9_-]{1,191}\z/',$owner)) $owners[]=$owner;
    if (!in_array($client,$owners,true)) return null;
    // WordPress database errors otherwise log entire SQL, including code/secret/token.
    global $wpdb;
    $wpdb->suppress_errors(true);
    $config = duanap_hub_config();
    if (is_wp_error($config) || $config['client_id'] !== $client || is_wp_error(duanap_hub_provider_ready())) duanap_hub_oauth_error('temporarily_unavailable',503);
    return $config;
}

function duanap_hub_oauth_error($code, $status=400) {
    nocache_headers();
    header('Cache-Control: private, no-store');
    header('X-Robots-Tag: noindex, nofollow');
    wp_send_json(['error'=>$code], $status);
}

function duanap_hub_protect_authorization() {
    $request = duanap_hub_oauth_request();
    $config = duanap_hub_owned_request($request);
    if (!$config) return;
    foreach (['response_type','redirect_uri','code_challenge_method','code_challenge','state'] as $key) {
        $value=$request->query($key);
        if (!is_string($value) || ($request->request($key) !== null && $request->request($key) !== $value)) duanap_hub_oauth_error('invalid_request');
    }
    if ($request->query('response_type') !== 'code' || $request->query('redirect_uri') !== $config['callback'] || $request->query('code_challenge_method') !== 'S256' || !preg_match('/\A[A-Za-z0-9_-]{43}\z/', $request->query('code_challenge')) || !preg_match('/\A[A-Za-z0-9_-]{32,256}\z/', $request->query('state'))) duanap_hub_oauth_error('invalid_request');
    nocache_headers();
    header('Cache-Control: private, no-store');
    header('X-Robots-Tag: noindex, nofollow');
    $login=$request->query('hub_login');
    if($login!==null){
        if($login!=='qq'||$request->server('REQUEST_METHOD')!=='GET'||($request->request('hub_login')!==null&&$request->request('hub_login')!==$login)||$request->query('scope')!=='basic')duanap_hub_oauth_error('invalid_request');
        // The blog browser may belong to a different QQ. Verify QQ through its
        // own app instead of treating an existing WordPress login as consent.
        $query=[];foreach(['client_id','redirect_uri','response_type','scope','state','code_challenge_method','code_challenge'] as $key)$query[$key]=$request->query($key);
        try{duanap_hub_social_flow('qq',false,wp_json_encode($query));}
        catch(Throwable $error){duanap_hub_authorization_failure(wp_json_encode($query),'blog_qq_unavailable');}
    }
}

function duanap_hub_authorization_failure($authorization,$reason){
    $return=duanap_hub_authorization_return($authorization);
    if(is_wp_error($return)||!$return)duanap_hub_oauth_error('invalid_request');
    parse_str(wp_parse_url($return,PHP_URL_QUERY),$query);
    $allowed=['blog_qq_not_found','blog_qq_proof_missing','blog_qq_conflict','blog_qq_unavailable','blog_qq_cancelled'];
    if(!in_array($reason,$allowed,true))$reason='blog_qq_unavailable';
    // Exact registered callback only; no caller-controlled redirect destination.
    wp_redirect(add_query_arg(['state'=>$query['state'],'error'=>$reason],$query['redirect_uri']),302);exit;
}

// Only a validated Hub PKCE request may survive the separate QQ round trip.
// Store parameters, never a caller-supplied return URL; rebuild at our origin.
function duanap_hub_authorization_return($value){
    if($value===null||$value==='')return null;
    $invalid=new WP_Error('hub_invalid_continuation','主站授权请求已变化，请重新登录。',['status'=>400]);
    if(!is_string($value)||strlen($value)>4096)return $invalid;
    $query=json_decode($value,true);$config=duanap_hub_config();
    $keys=['client_id','redirect_uri','response_type','scope','state','code_challenge_method','code_challenge'];
    if(!is_array($query)||is_wp_error($config)||count($query)!==count($keys)||array_diff($keys,array_keys($query)))return $invalid;
    foreach($query as $item)if(!is_string($item))return $invalid;
    if($query['client_id']!==$config['client_id']||$query['redirect_uri']!==$config['callback']||$query['response_type']!=='code'||$query['scope']!=='basic'||$query['code_challenge_method']!=='S256'||!preg_match('/\A[A-Za-z0-9_-]{43}\z/',$query['code_challenge'])||!preg_match('/\A[A-Za-z0-9_-]{32,256}\z/',$query['state']))return $invalid;
    return add_query_arg($query,home_url('/oauth/authorize/'));
}

function duanap_hub_exchange_token() {
    $request = duanap_hub_oauth_request();
    $config = duanap_hub_owned_request($request);
    if (!$config) return;
    foreach (['grant_type','code_verifier','code','redirect_uri'] as $key) if (!is_string($request->request($key))) duanap_hub_oauth_error('invalid_request');
    if ($request->request('grant_type') !== 'authorization_code' || $request->request('redirect_uri') !== $config['callback'] || !preg_match('/\A[A-Za-z0-9._~-]{43,128}\z/', $request->request('code_verifier')) || strlen($request->request('code')) > 512) duanap_hub_oauth_error('invalid_request');
    global $wpdb;
    if ($wpdb->query('START TRANSACTION') === false) duanap_hub_oauth_error('temporarily_unavailable', 503);
    try {
        $row = $wpdb->get_row($wpdb->prepare("SELECT client_id,user_id,code_challenge,code_challenge_method FROM {$wpdb->prefix}oauth_authorization_codes WHERE authorization_code=%s FOR UPDATE", $request->request('code')), ARRAY_A);
        if ($wpdb->last_error) throw new RuntimeException('Code storage is unavailable.');
        if (!$row || $row['client_id'] !== $config['client_id'] || empty($row['code_challenge']) || $row['code_challenge_method'] !== 'S256') {
            $wpdb->query('ROLLBACK'); duanap_hub_oauth_error('invalid_grant');
        }
        $user = get_user_by('id', (int)$row['user_id']);
        if (!$user || duanap_hub_user_blocked($user)) { $wpdb->query('ROLLBACK'); duanap_hub_oauth_error('access_denied', 403); }
        require_once __DIR__.'/oauth-storage.php';
        $storage = new Duanap_Hub_OAuth_Storage();
        // Explicit response type avoids the library's implicit refresh storage/default grants.
        $server = new WPOAuth2\Server($storage, ['allow_public_clients'=>false, 'use_openid_connect'=>false, 'use_jwt_access_tokens'=>false, 'access_lifetime'=>3600], [new WPOAuth2\GrantType\AuthorizationCode($storage)], ['token'=>new WPOAuth2\ResponseType\AccessToken($storage,null,['access_lifetime'=>3600])]);
        $response = $server->handleTokenRequest($request, new WPOAuth2\Response());
        if ($response->getStatusCode() >= 400) $wpdb->query('ROLLBACK');
        else {
            $token = $response->getParameter('access_token');
            $stored = is_string($token) ? $storage->getAccessToken($token) : null;
            $remaining = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}oauth_authorization_codes WHERE authorization_code=%s",$request->request('code')));
            if (!$stored || $stored['client_id'] !== $config['client_id'] || (int)$stored['user_id'] !== (int)$row['user_id'] || (string)$remaining !== '0' || $wpdb->last_error || $wpdb->query('COMMIT') === false) {
                $wpdb->query('ROLLBACK'); duanap_hub_oauth_error('temporarily_unavailable',503);
            }
        }
        $response->addHttpHeaders(['Cache-Control'=>'private, no-store','X-Robots-Tag'=>'noindex, nofollow']);
        $response->send(); exit;
    } catch (Throwable $error) { $wpdb->query('ROLLBACK'); duanap_hub_oauth_error('temporarily_unavailable', 503); }
}
