<?php
defined('ABSPATH') || exit;

function duanap_hub_checkin_cache_groups(){
    return ['users','userlogins','useremail','userslugs','user_meta','zib_option_meta_data'];
}

function duanap_hub_checkin_cache_ready(){
    $unavailable=new WP_Error('hub_checkin_cache_unverified','持久对象缓存配置尚未通过签到一致性检查。',['status'=>503]);
    try{
        global $wp_object_cache;
        // A plugin can change the global flag without replacing the real cache.
        // Accept the local path only for WordPress's actual built-in class.
        if(!wp_using_ext_object_cache()){
            $core=ABSPATH.WPINC.'/class-wp-object-cache.php';
            return is_object($wp_object_cache)&&get_class($wp_object_cache)==='WP_Object_Cache'&&is_readable($core)&&realpath((new ReflectionClass($wp_object_cache))->getFileName())===realpath($core)?true:$unavailable;
        }
        if(!defined('DUANAP_HUB_CACHE_PROFILE')||DUANAP_HUB_CACHE_PROFILE!=='redis-user-local-v1'||!defined('WP_REDIS_IGNORED_GROUPS')||!is_array(WP_REDIS_IGNORED_GROUPS))return $unavailable;
        if(!is_object($wp_object_cache)||get_class($wp_object_cache)!=='WP_Object_Cache'||!method_exists($wp_object_cache,'redis_status')||!$wp_object_cache->redis_status())return $unavailable;
        $dropin=WP_CONTENT_DIR.'/object-cache.php';$installed=WP_PLUGIN_DIR.'/redis-cache/includes/object-cache.php';
        if(!is_readable($dropin)||!is_readable($installed)||realpath((new ReflectionClass($wp_object_cache))->getFileName())!==realpath($dropin))return $unavailable;
        $version=get_file_data($dropin,['version'=>'Version']);
        if($version['version']!=='3.0.0'||!hash_equals(hash_file('sha256',$installed),hash_file('sha256',$dropin)))return $unavailable;
        // Require a startup policy shared by ALL requests, plus its actual runtime
        // classification. Adding groups only around this transaction is too late.
        foreach(duanap_hub_checkin_cache_groups() as $group){
            if(!in_array($group,WP_REDIS_IGNORED_GROUPS,true)||!in_array($group,$wp_object_cache->ignored_groups??[],true)||($wp_object_cache->group_type[$group]??null)!=='ignored')return $unavailable;
        }
        return true;
    }catch(Throwable $error){return $unavailable;}
}
