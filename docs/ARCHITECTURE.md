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
- `accounts`：P2 通过受保护的 WordPress 身份 API/OIDC，浏览器不获得服务端高权限凭据。
- `edgeone`：P3 服务端读 API，设置超时和带时间戳的缓存。
- `bot`：P3 独立 QQ Bot 进程，只有绑定身份和业务 API，不直接写 WordPress 或游戏数据库。

各模块生命周期：`registered -> enabled/disabled -> configured -> healthy/unavailable`。禁用后不渲染入口；可选页面返回 404 或约定的降级页。保存的配置保留，以供再次启用。

## C. 数据权威

| 数据种类 | 权威写入方 |
| --- | --- |
| 页面、项目、公告、相册、随记、友链、站点配置、SEO、仪表盘布局 | 主站 SQLite |
| 用户、第三方身份、签到、积分、流水 | WordPress / 子比 + bridge 插件 |
| 游戏角色、牌局、战绩、修炼数值 | 对应游戏服务 |
| EdgeOne / GitHub 指标 | 外部 API；主站仅缓存 |

未配置认证时，首页必须仍然正常 SSR；不能在公共页面 `layout` 的根级 await WordPress 登录/积分。

## D. 运维和安全原则

- 私有数据统一写入 `HUB_DATA_DIR`，不放进 Git、`public/` 或 Next.js 编译产物。
- `lib/storage.ts` 为每个数据目录维护单进程运行锁和离线恢复维护锁；内容改写、媒体删除与在线备份通过进程内队列串行执行。SQLite 使用 WAL，在线备份通过 Backup API 生成一致性副本。
- 图片解码并重编码为随机名 WebP；公开媒体路由只读，文件响应带 `nosniff`。备份下载独立鉴权，恢复只通过停机 CLI 执行。
- `HUB_SITE_URL` 决定站点真实 origin、canonical 和 CSRF Origin 校验；公网 Nginx 须正确设置 Host/HTTPS，EdgeOne 避免缓存登录及 API 响应。
- Studio 与用户身份分权：主站后台管理员会话独立，P2 的普通用户 QQ 登录不会自动有后台权限。
- 所有改写请求需身份鉴权与来源校验；OAuth 的 state、PKCE、精确 redirect_uri 均需在 P2 验证。
- WordPress 积分必须使用唯一业务事件 ID 防重放；提交成功以权威服务确认结果为准。
- 外部数据适配器应有超时、有限重试、明确显示过期或失败，不把失败当作 0。
- 游戏角色 API 的权限和结算必须由游戏服务自身验证，不信任浏览器或机器人提供的玩家 ID。

## E. SEO 发布时戳

当前开发骨架的 Sitemap 不主动声明 `lastmod`；待正式区分正文内容更新与仅运营状态切换后，再记录内容变化时间并输出真实 `lastmod`。

## F. 可用性判定

P1 的本地生产构建、浏览器/API、断网和备份恢复演练已完成。2026-10-13 已按用户选择使用全新数据目录部署主域，服务器真实备份恢复、域名/HTTPS 和 EdgeOne 缓存检查通过，证据见 `DEPLOYMENT-2026-10-13.md`。旧项目没有导入，历史内容迁移及搜索平台实际收录不能由这些检查代替。

## G. 公开内容视图（2026-10-20，本地布局迁移）

`blog`、`photos`、`notes`、`links` 为 P1 展示模块。第二批新增 `albums`、`notes`、`friend_links` 三个本地内容表；Studio 独立管理相册、个人随记和友链，同时保留已发布项目生成的相册/动态/入口。数据不相互复制，个人内容不依赖项目模块开启。

Blog 使用站点 `blogUrl` 提供独立博客入口，始终 noindex。2026-10-21 增加显式可选的只读 WordPress 摘要：可信服务端 `HUB_WORDPRESS_URL` 指定唯一来源，Studio 的 `blogSyncEnabled` 默认关闭；配置入口本身不会触发请求。独立缓存、期限/体积/页数限制、失败退避与保留摘要见 `LOCAL-DYNAMIC-ACCEPTANCE.md`。完整正文、评论和身份仍归 WordPress，不接 P2 会员与积分；P3 content 注册项继续保留为后续更完整适配器。四个展示模块各自可禁用；关闭 projects 仅移除它派生的内容，个人相册/随记/友链仍可公开。

空内容视图不进入 Sitemap；禁用入口返回 404。公开内容 SSR，搜索/排序/灯箱和本地音乐使用客户端组件。UI 样式作用域为 `.hub-public`，Studio 保持现有样式和独立鉴权。

首页卡片编排和歌单属于 `site_settings` JSON：旧设置合并默认13卡片，未改变卡片配置时保留复刻网格；自定义启停/顺序/宽度采用流式网格。音乐 URL 只交给浏览器播放器，在服务器端不抓取；媒体库中的歌单封面同样受既有设置引用保护。默认不播放，播放结束可继续下一首，失败提供重试或本地文件选择。

个人随记公开条件为 published 且 published_at 不晚于请求时间，发布与时间检查同时作用于页面、首页和 RSS。内容管理 API 位于 `/api/studio/content/[kind]` 与 `/[id]`，kind 仅允许 albums/notes/links，写操作统一使用现有管理员/Origin 校验与数据锁。草稿中引用的媒体同样受删除保护。

SQLite schema 升至 2：已存在的旧库在升级前保存 `migration-snapshots/before-content-v2-*.sqlite`（剔除会话），新表与版本号在事务内提交。备份仍使用原归档容器，数据库校验按 schema 版本检查新增表；旧备份保留兼容，冲突同名表会被提前拒绝。schema 2 数据必须使用本版或更新的代码/恢复工具，回滚需使用对应旧版备份并停止应用进程。
