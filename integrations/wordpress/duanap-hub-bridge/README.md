# duanap Hub Bridge 0.3.0

P2 隔离候选：稳定身份和本人只读资料、积分、签到状态、积分流水，以及默认关闭的原生社交绑定与统一每日签到适配。WordPress 保持用户和业务数据权威；本插件没有通用积分发放或 Studio 管理权限接口。许可：GPL-2.0-or-later。

## 支持边界

- PHP 8.1+；实际验证为 WordPress 7.1.3 / PHP 8.4.26 / MariaDB 10.11。
- WP OAuth Server 社区包 `oauth2-provider` **4.5.2**，启用 OAuth，关闭 JWT/OIDC。访问令牌长度设置为 **40–255**。
- 子比 `zibll` **9.0** 的读取函数，业务时区 `Asia/Shanghai`。积分/签到开关按接口分别检查。
- `users`、`duanap_hub_identities`、`oauth_authorization_codes`、`oauth_access_tokens` 必须是 InnoDB；插件验证引擎，不自动转换既有表。
- 已在全新数据库、合成用户及完整子比 9.0 下通过读取、OAuth 和社交绑定隔离测试。社交 SDK 使用原装 Yurun OAuth Login 2.1.0，外部 HTTP 响应由私有测试夹具提供。**真实 QQ/GitHub/Gitee 授权、Redis 兼容与生产启用尚未验收。** PHP 8.1 最低版本仅声明兼容，未另行运行该版本。

## 配置与授权合同

只在已批准的环境，将此目录放到 `wp-content/plugins/duanap-hub-bridge`。先安装候选 Provider、创建专用机密客户端，然后在服务器私有 `wp-config.php` 设置：

```php
define('DUANAP_HUB_CLIENT_ID', 'YOUR_DEDICATED_CLIENT_ID');
define('DUANAP_HUB_REDIRECT_URI', 'https://YOUR_HUB_HOST/api/auth/callback');
```

Hub 的回调已在 P2-2 隔离候选实现，正式启用仍须联调。Provider 客户端必须配置同一个精确回调、`authorization_code` grant 和 `basic` scope。客户端密钥留在 Provider 和 Hub 的私有服务器配置中，本插件不增加共享管理员密码。配置与当前客户端验证见 [P2-2 记录](../../../docs/P2-ACCOUNTS-2026-10-14.md)。

激活建立插件专用 UID、社交映射、近期验证和授权事务表并保存非敏感客户端 ID，不创建会员或改余额。升级已有候选需在受控环境重新激活以建立新增表；缺表时社交功能拒绝服务，不自动转换既有表。已有用户第一次通过本人读取请求时补齐 UID。保存的客户端 ID 使配置被误删时仍能拒绝该 Hub 客户端请求；其他 OAuth 客户端继续由原 Provider 处理。更换专用客户端应停用旧客户端、撤销旧令牌并重新激活 Bridge 更新记录。

当前委托 Provider 的 `/oauth/authorize/`、`/oauth/token/`、`/oauth/revoke/`。完整主题下已通过实际 HTTP 共存测试；真实平台授权与生产网络仍是正式启用门槛。

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
| `/me/bindings` | `providers`, `password_ready`, `management_url`, `recovery_url`, `as_of`；社交适配关闭时 503 |

流水条目仅含 `delta`、`balance_after`、去 HTML 的 `reason`、UTC `occurred_at`。上游最多保留 50 条，这不是完整积分审计账本。`page` 1–50，`per_page` 1–20。原生分钟精度记录转换后不增加精度。

401：缺失、过期或撤销的令牌。403：错误客户端、非用户令牌、账号删除/停用/封禁。400：身份覆盖参数或非法分页。503：配置、版本、引擎、时区、业务开关、数据格式或存储不可用；不会把失败显示为零余额。签到写入有单独默认关闭的开关，见下文。

UID 为随机 UUIDv4，对 WP 用户 ID 唯一。分配时锁定有效用户行；删除用户后保留 UID 退役记录，清除 WP ID 关联，不重新使用旧 UID。封禁判定直接读取状态，过期封禁允许读取但不调用会自动解封、写元数据的主题函数。返回中不含 WP 内部 ID、邮箱、角色、密码、密钥或令牌。

## 集成测试

Python 标准库测试，不需 Docker。仅对新建的开发夹具运行。夹具须满足：回环 HTTP 地址；根目录 `duanap-hub-fixture.marker` 内容 `isolated`；`DUANAP_HUB_TEST_FIXTURE=true`；`WP_ENVIRONMENT_TYPE=development`；数据库名以 `hub_p2_audit_` 开头。认证测试先用 CLI 核对标记与 HTTP home，随后才登录；故障注入只有 CLI 入口。PHP 开发服务须带 `-d opcache.enable=0 -d opcache.enable_cli=0`，避免配置故障注入被 worker 字节码缓存延迟；内置 HTTP 服务的 `cli-server` 仍受 `opcache.enable` 控制，仅关闭 CLI 开关不够。生产 PHP 配置不需要因此改变。

私有 JSON 配置保存在仓库外，包含 `home`、`callback`、`clientId`、`clientSecret`、合成 `alice`/`bob`（`id`, `username`, `password`）和 `otherClient`（`id`, `secret`）。Alice/Bob 用户名以 `bridge-` 开头，测试余额分别为 100/200；Alice 当天已签到、连续 3 天、首条流水增加 5。主题函数夹具由受控环境提供，不复制商业主题源码到仓库。合成用户环境应拦截邮件、禁用 cron 和外网访问。

```sh
python3 tests/integration.py --config PRIVATE_FIXTURE_JSON --wp-root ISOLATED_WORDPRESS_ROOT --php PHP_BINARY
python3 tests/oauth.py --config PRIVATE_FIXTURE_JSON --wp-root ISOLATED_WORDPRESS_ROOT --php PHP_BINARY
PHP_BINARY tests/social.php ISOLATED_WORDPRESS_ROOT
python3 tests/social-http.py --config PRIVATE_FIXTURE_JSON --wp-root ISOLATED_WORDPRESS_ROOT --php PHP_BINARY
```

测试日志只输出断言名称和计数，不输出凭据。完整测试会创建/删除合成用户、临时封禁、更改合成数据、注入 SQL 触发器故障、切换夹具主题/Provider、改夹具配置及表引擎；正常结束在 `finally` 恢复。进程被强杀时应停掉夹具服务，核对私有配置备份、触发器、表引擎和选项后再重跑，不能对生产库运行。

P2-1 原始结果及 P2-2 结果见各阶段记录；P2-3 的完整主题、社交 SDK 和 Hub 回归结果见 [P2-3 验收记录](../../../docs/P2-SOCIAL-2026-10-14.md)。

## 默认关闭的社交适配

仅已批准环境配置 `DUANAP_HUB_SOCIAL_ENABLED=true` 才接管 QQ/GitHub/Gitee 的原有登录和回调地址，以及原生解绑动作。应用设置继续归子比，密钥不进入 Hub；必须为直接模式、准确本站 HTTPS 回调和已安装 SDK。社交表、用户表及用户元数据表必须为 InnoDB。

本人管理入口为 `/hub-account-bindings`：操作要求五分钟内的 WordPress 重新验证及 WordPress nonce。主站只展示本人绑定状态、引导到博客管理；`expect_uid` 用于拒绝主站和博客当前账号不一致。社交授权 state 为独立随机数，绑定浏览器、应用配置、当前账号及会话，五分钟内只能消费一次。

身份由 provider + AppID + 平台 subject 唯一确定；数据库只保存该组合的摘要，原始 subject 仍在 WordPress 原生字段。首次授权可建立 WordPress 用户，昵称或邮箱相同不会合并。写入短事务、用户行锁及唯一约束保护映射；历史 claim 必须与原生字段唯一所有权一致，不一致拒绝登录。事务内验证直接读数据库，提交与回滚后清理原生及主题对象缓存。

未知随机密码不算备用方式；只有成功用当前密码登录过才计入。最后一种可用登录方式不能解绑，备用平台必须满足实际登录所需的本地配置及 SDK 检查；这不代表远端平台实时健康检测。没有可信 AppID 来源的旧原生绑定不会自动认领。人工独立核实后，才可用私有 `DUANAP_HUB_SOCIAL_LEGACY_APPS` 映射声明已核实的应用来源；不可仅凭昵称/邮箱配置该映射。

密码设置、邮件及找回归 WordPress 原生流程；无已验证恢复渠道的纯社交账号需要运营方独立核实归属，不保证单靠找回链接就能恢复。

## 备份与停用

插件 UID、社交映射和每日事件表与非敏感客户端 ID 选项归 WordPress 备份，需与用户、积分及原生日志一致；不放入 Hub 内容备份。Provider 令牌属于私有数据。没有卸载删除逻辑，停用保留 UID、事件和已有业务数据。

## 默认关闭的统一签到

WordPress 的 `DUANAP_HUB_CHECKIN_ENABLED=true` 才接管原生 `wp_ajax_user_checkin`；Hub 的 `HUB_CHECKIN_ENABLED=1` 是独立写入开关，默认值 0。升级需重新激活 Bridge 建立事件表。开关关闭时原生主题继续原有行为；已有回执的本人查询不受写入开关影响。检测到持久对象缓存、非 InnoDB 表、不兼容主题/时区、未审计签到业务钩子时拒绝统一签到，不宣称这些部署已通过。

| 本人接口 | 合同 |
| --- | --- |
| `POST /me/checkin` | JSON `business_date`，必须为服务端当前北京时间自然日；本人 Bearer 鉴权，拒绝身份覆盖 |
| `GET /me/checkin/result?business_date=YYYY-MM-DD` | 本人指定日期回执；已关闭写入仍可查询；不重新发奖 |

`success` 和 `already` 返回稳定 UUID 回执、实际积分/经验到账值、签到累计/连续天数和提交时余额；重放保留同一回执及原结果。`processing` 表示正在持有同一用户锁，`not_recorded` 只用于结果查询，表示尚无已提交事件。503 表示结果未确认，不能自动当作未发奖或重复写入。回执是历史事实，当前余额应重新读取积分接口。

每日唯一键为 `hub_uid + daily_checkin + business_date`，首次事件由服务端记录 blog/hub 来源，不信任调用方自报来源。原生 AJAX 和 API 进入同一短事务，调用完整主题的原始奖励逻辑；实际金额受原生每日上限影响。已有原生签到仅补观测回执，实际到账记 0，不追发。WordPress 用户行及元数据行锁、SQL失败捕获、提交后缓存清理与数据库事务状态保护保证积分、经验、签到/奖励记录和回执共同提交或回滚。

当前只支持已验收的 MariaDB/mysqli 运行环境和原生 SQL 形式。WordPress 自动重连后的重试 SQL 必须仍处于事务，否则不写入；提交连接变更返回未确认，随后查询同一日期回执。遇到新业务 SQL/主题钩子拒绝执行，需要重新审计，不放宽为无保护写入。

原生按钮增加外置脚本，点击捕获阶段补 WordPress action nonce，复用主题原 AJAX；不修改商业源码。处理中响应不带已签到详情链接。主站具有 Origin/CSRF/请求体边界、本人 UID 检查、独立写入开关和显式查询按钮；未确认结果不自动重试，不在浏览器累加积分。

隔离测试命令：

```sh
PHP_BINARY tests/checkin.php ISOLATED_WORDPRESS_ROOT
python3 tests/checkin-http.py --config PRIVATE_FIXTURE_JSON --wp-root ISOLATED_WORDPRESS_ROOT --php PHP_BINARY
# Compiles only a process-local clock shim inside the private sandbox.
gcc -shared -fPIC -o PRIVATE_SANDBOX/checkin-clock.so tests/checkin-clock.c -ldl
python3 tests/checkin-boundary.py --wp-root ISOLATED_WORDPRESS_ROOT --php PHP_BINARY --preload PRIVATE_SANDBOX/checkin-clock.so
```

所有脚本先核对显式标记、新建数据库前缀和开发环境；CLI 故障测试仅针对合成账号创建触发器/断开本测试连接。测试时钟只注入子 PHP 进程，不改变系统/生产服务时钟。生产邮件、Redis、WPOPT 和其他插件组合尚未完成验收。结果与停用边界见 [P2-4 记录](../../../docs/P2-CHECKIN-2026-10-15.md)。

实际插件停用/重启且保留业务记录的隔离演练：先停止测试 HTTP，再执行 `python3 tests/rollout.py --wp-root ISOLATED_WORDPRESS_ROOT --php PHP_BINARY`。仅允许在新建标记隔离实例中改变插件状态。生产门槛与完整恢复证据见 [P2-5 准备记录](../../../docs/P2-ROLLOUT-2026-10-15.md)。

未来回退先关闭 Hub 账号模块并清除本地用户会话、停用专用 OAuth 客户端/撤销令牌，关闭社交适配再停用 Bridge；保留用户、UID、社交映射和业务账本。关闭后恢复主题原生行为，新增唯一约束/解绑保护不再覆盖该原生流程；重新启用若原生绑定已变化，须人工核实。不能用旧余额快照覆盖新增交易。正式部署前仍需真实登录、持久缓存、备份与回退验收。本批仅提交候选代码，生产博客保持未安装状态。
