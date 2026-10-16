<?php
// Install only as a MU plugin in a marked, offline synthetic WordPress fixture.
if(!defined('DUANAP_HUB_TEST_FIXTURE')||DUANAP_HUB_TEST_FIXTURE!==true||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_')||!is_file(ABSPATH.'duanap-hub-fixture.marker')||trim(file_get_contents(ABSPATH.'duanap-hub-fixture.marker'))!=='isolated')return;
if(!defined('DUANAP_HUB_QQ_UNION_REALM'))define('DUANAP_HUB_QQ_UNION_REALM','fixture-developer');
class Duanap_Test_Social_Response {
    public function __construct(private $value){}
    public function body(){return is_string($this->value)?$this->value:json_encode($this->value);}
    public function json($assoc=true){return $this->value;}
    public function jsonp($assoc=true){return $this->value;}
    public function httpCode(){return 200;}
}
class Duanap_Test_Social_Http {
    public function __call($method,$args){return $this;}
    private function send($url,$body=[]){
        $parsed=parse_url($url);parse_str($parsed['query']??'',$params);$params=array_merge($params,$body);$path=$parsed['path']??'';
        if(!in_array($parsed['host'],['graph.qq.com','github.com','api.github.com','gitee.com'],true))throw new RuntimeException('Unexpected synthetic endpoint');
        if(str_contains($path,'token')){
            $code=$params['code']??'';
            if(!preg_match('/\Afixture_[a-z0-9_]{1,100}\z/',$code))throw new RuntimeException('Unknown synthetic code');
            return new Duanap_Test_Social_Response($parsed['host']==='graph.qq.com'?'access_token='.$code.'&expires_in=3600':['access_token'=>$code,'token_type'=>'bearer']);
        }
        $token=$params['access_token']??'';if(!$token)throw new RuntimeException('Missing synthetic token');
        $subject=strtoupper(md5($token));
        if($path==='/oauth2.0/me')return new Duanap_Test_Social_Response(['client_id'=>'900000001','openid'=>$subject]+(!empty($params['unionid'])&&!str_starts_with($token,'fixture_no_union_')?['unionid'=>'fixture-union-'.$subject]:[]));
        if($path==='/user/get_user_info')return new Duanap_Test_Social_Response(['ret'=>0,'nickname'=>'同名测试','figureurl_qq_2'=>'']);
        return new Duanap_Test_Social_Response(['id'=>(int)sprintf('%u',crc32($token))+1,'name'=>'同名测试','avatar_url'=>'']);
    }
    public function get($url){return $this->send($url);}
    public function post($url,$body=[]){return $this->send($url,$body);}
}
add_filter('duanap_hub_social_http',static fn()=>new Duanap_Test_Social_Http(),20);
