<?php
defined('ABSPATH') || exit;

// The upstream response generator ignores storage return values. Fail immediately
// so token insertion and code deletion remain inside the same rollback boundary.
class Duanap_Hub_OAuth_Storage extends WPOAuth2\Storage\Wordpressdb {
    public function setAccessToken($access_token,$client_id,$user_id,$expires,$scope=null) {
        if (parent::setAccessToken($access_token,$client_id,$user_id,$expires,$scope) !== 1) throw new RuntimeException('Token persistence failed.');
        return 1;
    }

    public function expireAuthorizationCode($code) {
        if (parent::expireAuthorizationCode($code) !== 1) throw new RuntimeException('Code consumption failed.');
        return 1;
    }
}
