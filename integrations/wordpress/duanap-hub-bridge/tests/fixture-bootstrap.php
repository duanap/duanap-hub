<?php
// Validate accidental production configuration BEFORE executing wp-load.php.
function duanap_test_config($input){
    $root=realpath($input);
    if(!$root||$root!==rtrim($input,'/')||realpath($root.'/wp-config.php')!==$root.'/wp-config.php'||realpath($root.'/duanap-hub-fixture.marker')!==$root.'/duanap-hub-fixture.marker'||trim(file_get_contents($root.'/duanap-hub-fixture.marker'))!=='isolated')throw new RuntimeException('Real marked test root required');
    $sink=$root.'/wp-content/mu-plugins/000-duanap-test-isolation.php';
    if(realpath($sink)!==$sink||!hash_equals(hash_file('sha256',__DIR__.'/fixture-isolation.php'),hash_file('sha256',$sink)))throw new RuntimeException('Verified fixture mail and HTTP isolation required');
    $required=['DB_NAME','DB_USER','DB_PASSWORD','DB_HOST','WP_HOME','WP_SITEURL','WP_ENVIRONMENT_TYPE','DUANAP_HUB_TEST_FIXTURE','WP_HTTP_BLOCK_EXTERNAL','DISABLE_WP_CRON'];
    $tokens=[];foreach(token_get_all(file_get_contents($root.'/wp-config.php')) as $token){
        if(is_array($token)&&in_array($token[0],[T_OPEN_TAG,T_WHITESPACE,T_COMMENT,T_DOC_COMMENT],true))continue;
        $tokens[]=is_array($token)?$token[1]:$token;
    }
    $literal=static function($text){
        if($text==='true')return true;if($text==='false')return false;
        if(strlen($text)<2||!in_array($text[0],["'",'"'],true)||$text[strlen($text)-1]!==$text[0])return null;
        $value=substr($text,1,-1);
        if($text[0]==="'")return str_replace(["\\\\","\\'"],["\\","'"],$value);
        if(str_contains($value,'$'))return null;
        return stripcslashes($value);
    };
    $config=[];
    for($i=0;$i<count($tokens)-5;$i++){
        if(strtolower($tokens[$i])!=='define'||$tokens[$i+1]!=='('||$tokens[$i+3]!==',')continue;
        $key=$literal($tokens[$i+2]);if(!in_array($key,$required,true))continue;
        if(array_key_exists($key,$config)||$tokens[$i+5]!==')')throw new RuntimeException('Literal fixture config required');
        $config[$key]=$literal($tokens[$i+4]);
    }
    foreach($required as $key)if(!isset($config[$key]))throw new RuntimeException('Explicit fixture config required');
    if(!preg_match('/\Ahub_p2_audit_[a-f0-9]{6,24}\z/',$config['DB_NAME'])||$config['DB_USER']!==$config['DB_NAME']||$config['DB_HOST']!=='localhost:/run/mysqld/mysqld.sock'||$config['WP_ENVIRONMENT_TYPE']!=='development'||$config['DUANAP_HUB_TEST_FIXTURE']!==true||$config['WP_HTTP_BLOCK_EXTERNAL']!==true||$config['DISABLE_WP_CRON']!==true||!is_string($config['DB_PASSWORD']))throw new RuntimeException('Synthetic local database and offline environment required');
    foreach(['WP_HOME','WP_SITEURL'] as $key){$url=parse_url($config[$key]);if(!$url||($url['scheme']??'')!=='http'||($url['host']??'')!=='127.0.0.1'||isset($url['user'])||isset($url['pass']))throw new RuntimeException('Loopback site required');}
    return $root;
}

function duanap_test_bootstrap($input){
    $root=duanap_test_config($input);
    // wp-load expects file-scope globals. Validate first, load at caller scope.
    return $root;
}

function duanap_test_sinks(){
    if(!defined('DUANAP_HUB_TEST_FIXTURE')||DUANAP_HUB_TEST_FIXTURE!==true||wp_get_environment_type()!=='development')throw new RuntimeException('Fixture must remain isolated');
    add_filter('pre_wp_mail',static fn()=>true,PHP_INT_MAX);
    add_filter('pre_http_request',static fn()=>new WP_Error('fixture_offline','External fixture HTTP blocked.'),PHP_INT_MAX);
}

if(PHP_SAPI==='cli'&&realpath($_SERVER['SCRIPT_FILENAME']??'')===__FILE__){
    try{if(count($argv)!==2)exit(1);duanap_test_config($argv[1]);echo '{"validated":true}';}
    catch(Throwable $e){fwrite(STDERR,"Unsafe fixture configuration refused before WordPress bootstrap\n");exit(1);}
}
