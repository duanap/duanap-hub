<?php
defined('ABSPATH') || exit;

// A matching realm is an operator assertion that QQ has actually enabled the
// applications' shared UnionID scope. It cannot manufacture that permission.
function duanap_hub_qq_union_realm(){
    $realm=defined('DUANAP_HUB_QQ_UNION_REALM')?DUANAP_HUB_QQ_UNION_REALM:'';
    return is_string($realm)&&preg_match('/\A[A-Za-z0-9_-]{1,100}\z/',$realm)?$realm:'';
}
function duanap_hub_qq_union_capture($sdk,$config){
    $realm=duanap_hub_qq_union_realm();
    if(!$realm)return null;
    try{
        $result=$sdk->http->get($sdk->getUrl('oauth2.0/me',['access_token'=>$sdk->accessToken,'unionid'=>1]))->jsonp(true);
        if(!is_array($result)||isset($result['error'])||(string)($result['client_id']??'')!==$config['appid']||($result['openid']??null)!==$sdk->openid||!is_string($result['unionid']??null)||!preg_match('/\A[A-Za-z0-9_-]{16,128}\z/',$result['unionid']))return null;
        return ['realm'=>$realm,'app_id'=>$config['appid'],'subject'=>$sdk->openid,'union_id'=>$result['unionid']];
    }catch(Throwable $error){return null;} // Optional matching never blocks native login.
}
function duanap_hub_qq_union_read($id){
    $realm=duanap_hub_qq_union_realm();
    if(!$realm)return null;
    $row=get_user_meta($id,'duanap_hub_qq_union',true);
    if(!is_array($row)||($row['realm']??'')!==$realm)return null;
    try{$config=duanap_hub_social_config('qq');}catch(Throwable $error){return null;}
    if(($row['app_id']??'')!==$config['appid']||($row['subject']??null)!==get_user_meta($id,'oauth_qq_openid',true)||!is_string($row['union_id']??null)||!preg_match('/\A[A-Za-z0-9_-]{16,128}\z/',$row['union_id']))return null;
    return ['realm'=>$realm,'union_id'=>$row['union_id']];
}
