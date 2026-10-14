<?php
defined('ABSPATH') || exit;

function duanap_hub_native_integer($value) {
    if (!is_int($value) && !is_string($value)) return null;
    $integer = filter_var($value, FILTER_VALIDATE_INT);
    return $integer === false ? null : $integer;
}

function duanap_hub_zibll_ready() {
    $theme = wp_get_theme(get_template());
    if (get_template() !== 'zibll' || $theme->get('Version') !== '9.0' || !function_exists('_pz') || !function_exists('zibpay_get_user_points') || !function_exists('zib_get_user_meta') || !function_exists('zib_user_is_checkined') || !function_exists('zib_get_user_checkin_continuous_day') || !function_exists('zib_get_user_checkin_all_day')) return new WP_Error('hub_theme_unavailable', 'The validated Zibll read adapter is unavailable.', ['status'=>503]);
    if (wp_timezone()->getName() !== 'Asia/Shanghai') return new WP_Error('hub_timezone_unavailable', 'The business timezone must be Asia/Shanghai.', ['status'=>503]);
    return true;
}

function duanap_hub_read_business($request) {
    $ready = duanap_hub_zibll_ready();
    if (is_wp_error($ready)) return $ready;
    $user = duanap_hub_context($request)['user'];
    $path = $request->get_route();
    $as_of = gmdate('c');
    if (str_ends_with($path, '/points')) {
        if (!_pz('points_s')) return new WP_Error('hub_points_disabled', 'Points are disabled.', ['status'=>503]);
        $raw = get_user_meta($user->ID, 'points', true);
        if ($raw !== '' && duanap_hub_native_integer($raw) === null) return new WP_Error('hub_points_unavailable', 'Point balance is invalid.', ['status'=>503]);
        return ['balance'=>(int)zibpay_get_user_points($user->ID), 'as_of'=>$as_of];
    }
    if (str_ends_with($path, '/checkin')) {
        if (!_pz('checkin_s')) return new WP_Error('hub_checkin_disabled', 'Check-in is disabled.', ['status'=>503]);
        return ['business_date'=>wp_date('Y-m-d'), 'timezone'=>'Asia/Shanghai', 'checked_in'=>(bool)zib_user_is_checkined($user->ID), 'continuous_days'=>(int)zib_get_user_checkin_continuous_day($user->ID), 'total_days'=>(int)zib_get_user_checkin_all_day($user->ID), 'as_of'=>$as_of];
    }
    if (!_pz('points_s')) return new WP_Error('hub_points_disabled', 'Points are disabled.', ['status'=>503]);
    $page = $request->get_param('page') ?? 1;
    $size = $request->get_param('per_page') ?? 20;
    if (!is_scalar($page) || !is_scalar($size) || !ctype_digit((string)$page) || !ctype_digit((string)$size) || (int)$page < 1 || (int)$page > 50 || (int)$size < 1 || (int)$size > 20) return new WP_Error('hub_invalid_page', 'Invalid pagination.', ['status'=>400]);
    $records = zib_get_user_meta($user->ID, 'points_record', true);
    if (!$records) $records=[];
    if (!is_array($records)) return new WP_Error('hub_history_unavailable', 'Point history is unavailable.', ['status'=>503]);
    $records = array_values(array_slice($records, 0, 50));
    $items=[];
    foreach (array_slice($records, ((int)$page-1)*(int)$size, (int)$size) as $record) {
        if (!is_array($record) || !isset($record['value'],$record['points'],$record['time'])) return new WP_Error('hub_history_unavailable', 'Point history is unavailable.', ['status'=>503]);
        $delta = duanap_hub_native_integer($record['value']);
        $balance = duanap_hub_native_integer($record['points']);
        if ($delta === null || $balance === null || !is_string($record['time'])) return new WP_Error('hub_history_unavailable', 'Point history contains invalid values.', ['status'=>503]);
        $date = DateTimeImmutable::createFromFormat('!Y-m-d H:i', (string)$record['time'], wp_timezone());
        if (!$date || $date->format('Y-m-d H:i') !== $record['time']) return new WP_Error('hub_history_unavailable', 'Point history time is invalid.', ['status'=>503]);
        $items[]=['delta'=>$delta, 'balance_after'=>$balance, 'reason'=>wp_strip_all_tags((string)($record['type'] ?? '')), 'occurred_at'=>$date->setTimezone(new DateTimeZone('UTC'))->format('c')];
    }
    return ['items'=>$items, 'page'=>(int)$page, 'per_page'=>(int)$size, 'total_retained'=>count($records), 'retention_limit'=>50, 'as_of'=>$as_of];
}
