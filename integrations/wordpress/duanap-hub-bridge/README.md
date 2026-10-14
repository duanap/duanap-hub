# duanap Hub Bridge 0.1.0

P2-1 隔离候选：稳定身份和本人只读资料、积分、签到状态、积分流水。WordPress 保持用户和业务数据权威；本插件没有签到、积分发放、第三方绑定或 Studio 管理权限接口。许可：GPL-2.0-or-later。

## 支持边界

- PHP 8.1+；实际验证为 WordPress 7.1.3 / PHP 8.4.26 / MariaDB 10.11。
- WP OAuth Server 社区包 `oauth2-provider` **4.5.2**，启用 OAuth，关闭 JWT/OIDC。访问令牌长度设置为 **40–255**。
- 子比 `zibll` **9.0** 的读取函数，业务时区 `Asia/Shanghai`。积分/签到开关按接口分别检查。
- `users`、`duanap_hub_identities`、`oauth_authorization_codes`、`oauth_access_tokens` 必须是 InnoDB；插件验证引擎，不自动转换既有表。
- 当前通过的是全新数据库、合成用户、主题读取函数适配夹具。**完整子比加载、真实 QQ 授权、Redis 兼容与生产启用尚未验收。** PHP 8.1 最低版本仅声明兼容，未另行运行该版本。

## 配置与授权合同

只在已批准的环境，将此目录放到 `wp-content/plugins/duanap-hub-bridge`。先安装候选 Provider、创建专用机密客户端，然后在服务器私有 `wp-config.php` 设置：

```php
define('DUANAP_HUB_CLIENT_ID', 'YOUR_DEDICATED_CLIENT_ID');
define('DUANAP_HUB_REDIRECT_URI', 'https://YOUR_HUB_HOST/api/auth/callback');
```

这是未来 Hub 回调示例；本批没有实现主站回调页面。Provider 客户端必须配置同一个精确回调、`authorization_code` grant 和 `basic` scope。客户端密钥留在 Provider 和未来 Hub 的私有服务器配置中，本插件不增加共享管理员密码。

激活仅建立插件专用 UID 表并保存非敏感客户端 ID，不创建会员或改余额。已有用户第一次通过本人读取请求时补齐 UID。保存的客户端 ID 使配置被误删时仍能拒绝该 Hub 客户端请求；其他 OAuth 客户端继续由原 Provider 处理。更换专用客户端应停用旧客户端、撤销旧令牌并重新激活 Bridge 更新记录。

当前委托 Provider 的 `/oauth/authorize/`、`/oauth/token/`、`/oauth/revoke/`。这组路径仍须在完整主题下验证与 QQ 共存，不能据路由生成模拟直接正式启用。

- 授权必须 `response_type=code`、精确 HTTPS 回调、32–256 字符 state、43 字符 S256 challenge。
- 换令牌只接受授权码和 43–128 字符 verifier；支持表单、JSON、HTTP Basic，拒绝来源冲突。身份配置失效时拒绝已识别的 Hub 请求。
- 使用成熟 Provider 校验客户端密钥、授权码、verifier 与 scope。短事务内独占授权码行，逐项检查令牌写入及授权码删除，提交成功后才响应；任一步失败回滚。
- 不签发 ID Token 或 refresh token，令牌期限 3600 秒；过期重新授权。必须由 Hub 服务端验证 state 并消费一次性授权事务，Bridge 的 state 格式校验不替代它。
- 读取接口只接受 `Authorization: Bearer …`，验证有效期、撤销、专用客户端、`basic` scope 和有效本人；不信任 WordPress Cookie 或客户端用户 ID。
- 已识别的 Hub OAuth/本人请求抑制 WordPress 的原始 SQL 错误日志，返回脱敏错误；避免数据库失败时将授权码、客户端密钥或访问令牌写入日志。Web 服务访问日志也须隐藏回调查询参数和 Authorization 头。

## 本人只读 API

基路径：`/wp-json/duanap-hub/v1`。成功/错误响应均 `private, no-store`，`X-Robots-Tag: noindex, nofollow`，`Vary: Authorization`。`as_of` 为本次读取时间，采用 UTC ISO 8601，表示观测时间而非业务最后修改时间。

| GET 路径 | 主要字段 |
| --- | --- |
| `/me` | `hub_uid`, `display_name`, `avatar_url`, `as_of` |
| `/me/points` | `balance`, `as_of` |
| `/me/checkin` | `business_date`, `timezone`, `checked_in`, `continuous_days`, `total_days`, `as_of` |
| `/me/points/history?page=1&per_page=20` | `items`, `page`, `per_page`, `total_retained`, `retention_limit`, `as_of` |

流水条目仅含 `delta`、`balance_after`、去 HTML 的 `reason`、UTC `occurred_at`。上游最多保留 50 条，这不是完整积分审计账本。`page` 1–50，`per_page` 1–20。原生分钟精度记录转换后不增加精度。

401：缺失、过期或撤销的令牌。403：错误客户端、非用户令牌、账号删除/停用/封禁。400：身份覆盖参数或非法分页。503：配置、版本、引擎、时区、业务开关、数据格式或存储不可用；不会把失败显示为零余额。POST 签到等写入路由不存在。

UID 为随机 UUIDv4，对 WP 用户 ID 唯一。分配时锁定有效用户行；删除用户后保留 UID 退役记录，清除 WP ID 关联，不重新使用旧 UID。封禁判定直接读取状态，过期封禁允许读取但不调用会自动解封、写元数据的主题函数。返回中不含 WP 内部 ID、邮箱、角色、密码、密钥或令牌。

## 集成测试

Python 标准库测试，不需 Docker。仅对新建的开发夹具运行。夹具须满足：回环 HTTP 地址；根目录 `duanap-hub-fixture.marker` 内容 `isolated`；`DUANAP_HUB_TEST_FIXTURE=true`；`WP_ENVIRONMENT_TYPE=development`；数据库名以 `hub_p2_audit_` 开头。认证测试先用 CLI 核对标记与 HTTP home，随后才登录；故障注入只有 CLI 入口。PHP 开发服务须带 `-d opcache.enable=0 -d opcache.enable_cli=0`，避免配置故障注入被 worker 字节码缓存延迟；内置 HTTP 服务的 `cli-server` 仍受 `opcache.enable` 控制，仅关闭 CLI 开关不够。生产 PHP 配置不需要因此改变。

私有 JSON 配置保存在仓库外，包含 `home`、`callback`、`clientId`、`clientSecret`、合成 `alice`/`bob`（`id`, `username`, `password`）和 `otherClient`（`id`, `secret`）。Alice/Bob 用户名以 `bridge-` 开头，测试余额分别为 100/200；Alice 当天已签到、连续 3 天、首条流水增加 5。主题函数夹具由受控环境提供，不复制商业主题源码到仓库。合成用户环境应拦截邮件、禁用 cron 和外网访问。

```sh
python3 tests/integration.py --config PRIVATE_FIXTURE_JSON --wp-root ISOLATED_WORDPRESS_ROOT --php PHP_BINARY
python3 tests/oauth.py --config PRIVATE_FIXTURE_JSON --wp-root ISOLATED_WORDPRESS_ROOT --php PHP_BINARY
```

测试日志只输出断言名称和计数，不输出凭据。完整测试会创建/删除合成用户、临时封禁、更改合成数据、注入 SQL 触发器故障、切换夹具主题/Provider、改夹具配置及表引擎；正常结束在 `finally` 恢复。进程被强杀时应停掉夹具服务，核对私有配置备份、触发器、表引擎和选项后再重跑，不能对生产库运行。

本批最终结果：本人读取套件 66 项断言；OAuth 套件 33 项断言，含 3 轮每轮 8 并发请求，成功兑换数均为 1。Hub 原有生产模式离线浏览器/API 35/35、类型/构建/结构检查通过。

## 备份与停用

插件 UID 表与非敏感客户端 ID 选项归 WordPress 备份，需与用户表一致；不放入 Hub 内容备份。Provider 令牌属于私有数据。没有卸载删除逻辑，停用保留 UID 和已有业务数据。

未来回退先关闭 Hub 账号模块并清除本地用户会话、停用专用 OAuth 客户端/撤销令牌，再停用 Bridge；保留用户、UID 与业务账本。不能用旧余额快照覆盖新增交易。正式部署前仍需完整主题/真实登录、缓存、备份与回退验收。本批仅提交候选代码，生产博客保持未安装状态。
