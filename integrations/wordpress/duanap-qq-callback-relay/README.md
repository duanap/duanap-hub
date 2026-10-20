# 保留已有 QQ 主域回调

用途仅限同一 QQ 应用：腾讯已登记 `https://duanap.cn/oauth/qq/callback`，该同一应用实际在子比博客处理登录，暂时无法修改登记地址。

**本项目当前不启用此转发。** 用户已核实主域 `102869604`、博客 `1905795653` 为两个独立应用，均在审核中。博客继续使用 `https://blog.duanap.cn/oauth/qq/callback`；主域保留 `/oauth/qq/callback` 路由和未启用提示。不得将一个应用的授权码交给另一个应用换令牌。隐私响应头不依赖转发开关，继续生效。

浏览器路径：子比 `/oauth/qq` → 腾讯授权 → 主域 `/oauth/qq/callback` → 博客 `/oauth/qq/callback`。主域仅将不透明的 code/state 转给固定博客地址；博客收到自己的原会话 Cookie，由子比原装 SDK 校验 state、换令牌并处理身份。主站不建立新身份会话。

## 成对配置

1. 仅在确认两端使用同一 QQ 应用和准确登记回调之后，设置 `HUB_WORDPRESS_URL=https://blog.duanap.cn` 与独立开关 `HUB_QQ_CALLBACK_RELAY_ENABLED=1`。配置博客地址本身不会打开转发。
2. 将本目录 PHP 文件安装为博客 `wp-content/mu-plugins/duanap-qq-callback-relay.php`。
3. 博客私有 `wp-config.php` 在加载 WordPress 之前设置：

   ```php
   define('DUANAP_QQ_PUBLIC_CALLBACK', 'https://duanap.cn/oauth/qq/callback');
   define('DUANAP_QQ_PUBLIC_APP_ID', '<the-same-qq-app-id>');
   ```

4. 上述 AppID 必须与子比当前 QQ 配置一致，否则不会覆盖回调。保持 AppKey 只在博客私有配置中；此模块不提供、改写或保存凭据，也不修改数据库中的子比选项。
5. 将主域、博客回调的源站访问日志（含宝塔站点统计日志）设为不记录参数，确保两端和边缘不缓存回调。
6. 真实 QQ 授权验收通过后，才单独启用首页 `HUB_QQ_LOGIN_ENABLED=1`。P2 accounts、积分、Provider、Bridge 的启用仍独立验收。

仅允许 HTTPS、无用户信息/端口/查询/片段的准确回调路径；博客必须为该主域或其子域。代理登录配置保持原状。本模块同时让 QQ 授权与换令牌的 SDK 配置使用同一个已登记主域 URI；只有跨域重定向而缺少这项配置会导致不一致。

未启用常量、应用不匹配或非子比主题时不覆盖回调。当前两应用配置下原生博客回调保持不变；不要修改主题源码来迁就另一应用。

## 验证与回退

- 主域缺失/异常参数返回 400 说明；转发未启用或配置缺失返回 503；仅验证过的同应用转发模式才返回 303。这些状态均不授予登录。
- `tests/config.php <隔离 WordPress 根目录> valid|disabled|different-app|missing-app-id|http|user|query|fragment|port|path` 仅在标记为 isolated、开发环境、独立测试数据库中运行。它检查同应用 URI 一致性、跨应用不覆盖、错误 state 在 HTTP 前被拒绝、数据库不变及其他登录方式不受影响；合成响应不等于真实腾讯授权验收。
- 回退时恢复主站发布/私有环境、博客私有常量和本 MU 文件、两站日志配置及独立 map 文件的备份。不恢复或覆盖用户数据库。
- 修改腾讯登记地址或更换主题/SDK 后，重新检查此兼容层，避免留下过时配置。
