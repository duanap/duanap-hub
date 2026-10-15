# 技术架构与运行时边界

## A. Stable Core

`duanap.cn`：Next.js App Router + SQLite + 内置模块注册表。Core 必须独立于 WordPress、EdgeOne、GitHub、QQ 机器人和小游戏服务运行。

Core 拥有：公开首页与独立内容路由、duanap Studio、管理员独立鉴权、模块/排序、项目运营内容、工具索引、SEO、RSS、媒体/数据备份和审计。

第一阶段用 `lib/db.ts` 管理 SQLite，`lib/modules.ts` 定义代码注册的模块及数据库开关；`lib/tools.ts` 仅登记已经实现的工具。内部模块通过代码部署，后台控制已注册模块的 enabled/order。

## B. 业务模块与外部适配器

- `about`：个人公开信息；本地 SQLite。
- `projects`：作品、游戏项目、手动运营状态、当前版本和内容记录；本地 SQLite。
- `games`：从 `projects` 中筛选游戏类别；P3 才接战绩与角色服务。
- `tools`：工具目录及逐个启用的独立工具；密码生成在浏览器本地执行。
- `content`：P3 才接 WordPress 文章摘要；未配置不触发请求。
- `accounts`：P2 优先免费 WordPress OAuth2 + S256 PKCE + Bridge 本人 API，浏览器不获得上游令牌；候选隔离验证见 `P2-COMPATIBILITY.md`，正式启用仍待联调。
- `edgeone`：P3 服务端读 API，设置超时和带时间戳的缓存。
- `bot`：P3 独立 QQ Bot 进程，只有绑定身份和业务 API，不直接写 WordPress 或游戏数据库。

各模块生命周期：`registered -> enabled/disabled -> configured -> healthy/unavailable`。禁用后不渲染入口；可选页面返回 404 或约定的降级页。保存的配置保留，以供再次启用。

## C. 数据权威

| 数据种类 | 权威写入方 |
| --- | --- |
| 页面、项目、公告、站点配置、SEO、仪表盘布局 | 主站 SQLite |
| 用户、第三方身份、签到、积分、流水 | WordPress / 子比 + bridge 插件 |
| 游戏角色、牌局、战绩、修炼数值 | 对应游戏服务 |
| EdgeOne / GitHub 指标 | 外部 API；主站仅缓存 |

未配置认证时，首页必须仍然正常 SSR；不能在公共页面 `layout` 的根级 await WordPress 登录/积分。

QQ 申请准备入口是公开导航：`/login/qq` 在未开通时提供本地说明，不请求 WordPress。只有单独配置 `HUB_QQ_LOGIN_ENABLED=1` 及有效 `HUB_WORDPRESS_URL` 后，点击才跳转博客固定原生 `oauth/qq` 路径；不建立 Hub 会话，不启用 accounts/签到，不在主站实现第二套 QQ OAuth。该准备入口按用户要求在账号模块关闭时仍显示，属于申请阶段的明确例外；真实接入与审核仍需取得应用参数后验证。

## D. 运维和安全原则

- 私有数据统一写入 `HUB_DATA_DIR`，不放进 Git、`public/` 或 Next.js 编译产物。
- `lib/storage.ts` 为每个数据目录维护单进程运行锁和离线恢复维护锁；内容改写、媒体删除与在线备份通过进程内队列串行执行。SQLite 使用 WAL，在线备份通过 Backup API 生成一致性副本。
- 图片解码并重编码为随机名 WebP；公开媒体路由只读，文件响应带 `nosniff`。备份下载独立鉴权，恢复只通过停机 CLI 执行。
- `HUB_SITE_URL` 决定站点真实 origin、canonical 和 CSRF Origin 校验；公网 Nginx 须正确设置 Host/HTTPS，EdgeOne 避免缓存登录及 API 响应。
- Studio 与用户身份分权：主站后台管理员会话独立，P2 的普通用户 QQ 登录不会自动有后台权限。
- 所有改写请求需身份鉴权与来源校验；OAuth 的 state、PKCE、精确 redirect_uri 均需在 P2 验证。
- WordPress 积分必须使用唯一业务事件 ID 防重放；提交成功以权威服务确认结果为准。
- P2 候选使用独立 `accounts.sqlite` 与普通用户 Cookie；服务器令牌/verifier 加密存储，业务请求不占用内容队列。默认关闭、恢复后清除本地普通认证数据，详见 `P2-ACCOUNTS-2026-10-14.md`。
- 外部数据适配器应有超时、有限重试、明确显示过期或失败，不把失败当作 0。
- 游戏角色 API 的权限和结算必须由游戏服务自身验证，不信任浏览器或机器人提供的玩家 ID。

## E. SEO 发布时戳

当前开发骨架的 Sitemap 不主动声明 `lastmod`；待正式区分正文内容更新与仅运营状态切换后，再记录内容变化时间并输出真实 `lastmod`。

## F. 可用性判定

P1 的本地生产构建、浏览器/API、断网和备份恢复演练已完成。2026-10-13 已按用户选择使用全新数据目录部署主域，服务器真实备份恢复、域名/HTTPS 和 EdgeOne 缓存检查通过，证据见 `DEPLOYMENT-2026-10-13.md`。旧项目没有导入，历史内容迁移及搜索平台实际收录不能由这些检查代替。

2026-10-15 发布 `ca008a0`，提供首页 QQ 申请准备入口，并保留 P2 账号/签到/真实 QQ 跳转默认关闭。生产内容、媒体和博客数据保留，Provider/Bridge 未安装；见 `DEPLOYMENT-2026-10-15.md`。代码已发布不代表 P2 功能已开放或已通过真实平台验收。
