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
| 页面、项目、公告、站点配置、SEO、仪表盘布局 | 主站 SQLite |
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

P1 的本地生产构建、浏览器/API、断网和备份恢复演练已完成，证据见 `DEVELOPMENT-STATUS.md`。生产发布仍需真实环境中的缓存、备份恢复、域名和迁移验证，不能用本地结果代替。
