# 保留已有 QQ 主域回调

用途：腾讯已登记 `https://duanap.cn/oauth/qq/callback`，子比实际在博客处理登录，暂时无法修改腾讯登记地址。

浏览器路径：子比 `/oauth/qq` → 腾讯授权 → 主域 `/oauth/qq/callback` → 博客 `/oauth/qq/callback`。主域仅将不透明的 code/state 转给固定博客地址；博客收到自己的原会话 Cookie，由子比原装 SDK 校验 state、换令牌并处理身份。主站不建立新身份会话。

## 成对配置

1. 主站服务器 `.env.local` 设置 `HUB_WORDPRESS_URL=https://blog.duanap.cn`。
2. 将本目录 PHP 文件安装为博客 `wp-content/mu-plugins/duanap-qq-callback-relay.php`。
3. 博客私有 `wp-config.php` 在加载 WordPress 之前设置：

   ```php
   define('DUANAP_QQ_PUBLIC_CALLBACK', 'https://duanap.cn/oauth/qq/callback');
   ```

4. 保持 QQ 应用 AppID/AppKey 只在博客私有配置中。此模块不提供、改写或保存凭据，也不修改数据库中的子比选项。
5. 将主域、博客回调的源站访问日志（含宝塔站点统计日志）设为不记录参数，确保两端和边缘不缓存回调。
6. 真实 QQ 授权验收通过后，才单独启用首页 `HUB_QQ_LOGIN_ENABLED=1`。P2 accounts、积分、Provider、Bridge 的启用仍独立验收。

仅允许 HTTPS、无用户信息/端口/查询/片段的准确回调路径；博客必须为该主域或其子域。代理登录配置保持原状。本模块同时让 QQ 授权与换令牌的 SDK 配置使用同一个已登记主域 URI；只有跨域重定向而缺少这项配置会导致不一致。

未启用常量或非子比主题时不覆盖回调；原生博客回调的 HTTP 地址仍显示在子比后台默认提示中，实际运行时配置以此模块为准。切勿为了消除该提示而另行修改主题源码。

## 验证与回退

- 主域缺失/异常参数返回 400 说明；配置缺失返回 503；有效形状参数返回 303 到固定博客回调。这些状态均不授予登录。
- `tests/config.php <隔离 WordPress 根目录> valid|disabled|http|user|query|fragment|port|path` 仅在标记为 isolated、开发环境、独立测试数据库中运行。它检查原装 SDK 的 URI 一致性、错误 state 在 HTTP 前被拒绝、数据库不变及其他登录方式不受影响；合成响应不等于真实腾讯授权验收。
- 回退时恢复主站发布/私有环境、博客私有常量和本 MU 文件、两站日志配置及独立 map 文件的备份。不恢复或覆盖用户数据库。
- 修改腾讯登记地址或更换主题/SDK 后，重新检查此兼容层，避免留下过时配置。
