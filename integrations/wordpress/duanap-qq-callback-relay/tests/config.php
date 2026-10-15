<?php
if(PHP_SAPI!=='cli'||count($argv)<3)exit(1);
$root=realpath($argv[1]);$mode=$argv[2];
if(!$root||!is_file($root.'/duanap-hub-fixture.marker')||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')exit(1);
$urls=['valid'=>'https://audit.invalid/oauth/qq/callback','http'=>'http://audit.invalid/oauth/qq/callback','user'=>'https://name@audit.invalid/oauth/qq/callback','query'=>'https://audit.invalid/oauth/qq/callback?next=evil','fragment'=>'https://audit.invalid/oauth/qq/callback#x','port'=>'https://audit.invalid:443/oauth/qq/callback','path'=>'https://audit.invalid/not-callback'];
if(isset($urls[$mode]))define('DUANAP_QQ_PUBLIC_CALLBACK',$urls[$mode]);elseif($mode!=='disabled')exit(1);
$_SERVER['REMOTE_ADDR']='127.0.0.1';require $root.'/wp-load.php';
if(!defined('DUANAP_HUB_TEST_FIXTURE')||!DUANAP_HUB_TEST_FIXTURE||wp_get_environment_type()!=='development'||!str_starts_with(DB_NAME,'hub_p2_audit_'))exit(1);
$checks=[];
function relay_check($name,$ok){global $checks;if(!$ok){fwrite(STDERR,'FAIL: '.$name."\n");exit(1);}$checks[]=$name;}
relay_check('compatibility module loaded',function_exists('duanap_qq_relay_public_callback'));
global $wpdb;$before=$wpdb->get_var("SELECT option_value FROM {$wpdb->options} WHERE option_name='zibll_options'");
$callback=duanap_qq_relay_public_callback();
relay_check('only exact enabled HTTPS callback accepted',($mode==='valid')?($callback===$urls['valid']):($callback===null));
$config=get_oauth_config('qq');relay_check('native QQ config uses intended URI',$config['backurl']===($callback??home_url('/oauth/qq/callback')));
relay_check('other providers retain native callbacks',get_oauth_config('github')['backurl']===home_url('/oauth/github/callback')&&get_oauth_config('gitee')['backurl']===home_url('/oauth/gitee/callback'));
relay_check('stored options unchanged',$before===$wpdb->get_var("SELECT option_value FROM {$wpdb->options} WHERE option_name='zibll_options'"));
if($mode==='valid'){
    $proxy=['oauth_agent'=>'proxy','oauth_qq_option'=>['backurl'=>'https://proxy.invalid/callback']];
    relay_check('global proxy configuration is untouched',duanap_qq_relay_options($proxy)===$proxy);
    $proxy=['oauth_agent'=>'close','oauth_qq_option'=>['agent'=>true,'backurl'=>'https://proxy.invalid/callback']];
    relay_check('QQ proxy configuration is untouched',duanap_qq_relay_options($proxy)===$proxy);
    class Relay_Test_Response {private $v;function __construct($v){$this->v=$v;}function body(){return is_string($this->v)?$this->v:json_encode($this->v);}function json($assoc=true){return $this->v;}function jsonp($assoc=true){return $this->v;}function httpCode(){return 200;}}
    class Relay_Test_HTTP {
        public $requests=[];public function __call($name,$args){return $this;}
        function get($url){$parsed=parse_url($url);parse_str($parsed['query']??'',$p);$this->requests[]=['path'=>$parsed['path'],'callback'=>$p['redirect_uri']??null];
            if($parsed['host']!=='graph.qq.com')throw new RuntimeException('Unexpected test endpoint');
            if($parsed['path']==='/oauth2.0/token')return new Relay_Test_Response('access_token=fixture_token_1234567890123456&expires_in=3600');
            if($parsed['path']==='/oauth2.0/me')return new Relay_Test_Response(['client_id'=>'900000001','openid'=>str_repeat('A',32)]);
            return new Relay_Test_Response(['ret'=>0,'nickname'=>'合成回调测试','figureurl_qq_2'=>'']);
        }
        function post($url,$data=[]){return $this->get($url.'?'.http_build_query($data));}
    }
    $sdk=new \Yurun\OAuthLogin\QQ\OAuth2($config['appid'],$config['appkey'],$config['backurl']);$http=new Relay_Test_HTTP();$sdk->http=$http;
    parse_str(parse_url($sdk->getAuthUrl(),PHP_URL_QUERY),$params);$state=$params['state'];
    relay_check('installed SDK authorizes registered public URI',$params['redirect_uri']===$urls['valid']);
    $refused=false;try{$sdk->getAccessToken($state,'fixture_authorization_code_12345678',str_repeat('b',32));}catch(Throwable $e){$refused=true;}
    relay_check('installed SDK rejects mismatched state before HTTP',$refused&&count($http->requests)===0);
    $sdk->getAccessToken($state,'fixture_authorization_code_12345678',$state);$info=$sdk->getUserInfo();
    relay_check('installed SDK exchanges with identical public URI',$http->requests[0]['callback']===$urls['valid']&&$info['nickname']==='合成回调测试');
    if(function_exists('duanap_hub_social_config'))relay_check('P2 adapter accepts explicitly configured QQ relay',duanap_hub_social_config('qq')['backurl']===$urls['valid']);
}
echo json_encode(['mode'=>$mode,'passed'=>count($checks),'checks'=>$checks,'productionDataUsed'=>false]);
