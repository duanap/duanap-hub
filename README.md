# duanap Hub · Little Space V4.4

基于 Next.js 16、TypeScript 与 SQLite 的个人数字门户。Little Space V4.4 的布局和交互已迁移为真实 React 组件；业务数据由 SQLite 保存，原型 HTML、localStorage 演示项目及虚构统计没有作为生产数据导入。

本次交付是 **P1 的本地开发候选版本**，位于 `codex/little-space-v44-p1`。正式生产部署与合并 `main` 由所有者另行确认。具体检查证据见 [验收记录](docs/P1-VALIDATION.md)。

## 可以做什么

- 首页、关于、作品与游戏展示；项目搜索、分类、人工状态、版本和维护说明。
- 项目详情按“项目介绍 / 项目截图 / 更新日志 / 开发计划”组织，支持真实图片预览和 Markdown 正文。
- 主站与 Studio 手机端各自五项底部导航、滚动顶部模糊、明暗主题、安全区与响应式卡片。
- Studio 独立管理员登录、作品/日志/计划编辑、首页模块排序、工具启停、个人资料、备案及 SEO 设置。
- 验证后的图片上传、SQLite 在线一致性快照、媒体校验清单、备份下载与全新目录恢复演练。
- 密码、JSON、UTF-8 Base64、北京时间戳、IP 本地格式检查、Markdown 安全预览和 HTML/纯文本导出。
- SSR、canonical、分享图、JSON-LD、robots、动态 Sitemap 和 RSS；草稿与禁用内容不公开。

首次启动不导入原型的游戏版本、演示项目、统计或用户资料。请从 Studio 发布已核实的真实内容。原型插画是装饰素材，不能当作线上项目的真实截图。

## 本地运行

使用 Node.js 22.13+（本轮在 Node.js 24.19.0 验证）及 pnpm 11.25.0：

```powershell
corepack pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
node scripts/hash-password.mjs
```

将交互脚本生成的密码哈希填入 `.env.local`，管理员用户名可通过 `HUB_ADMIN_USERNAME` 修改。公开页面无需管理员密码即可启动；后台需要正确配置的独立管理员密码。

```powershell
corepack pnpm dev
```

- 主站：<http://127.0.0.1:1026/>
- 后台：<http://127.0.0.1:1026/duanap/login>
- 健康：<http://127.0.0.1:1026/api/health>
- 站点地图：<http://127.0.0.1:1026/sitemap.xml>
- 订阅：<http://127.0.0.1:1026/feed.xml>

`HUB_SITE_URL` 必须匹配浏览器实际 Origin；它决定 canonical 和后台请求来源校验。`HUB_DATA_DIR` 保存数据库、媒体、迁移前快照和备份。正式部署使用发布目录之外的绝对路径。

## 本地验证

```powershell
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm check:structural
corepack pnpm test:e2e
```

浏览器测试使用本机 Chrome、1027 端口、隔离数据库与随机临时管理员身份；数据和运行报告位于忽略的目录，不会写入主站数据或执行生产操作。`format` 可统一组件格式，无 CI 前置要求。

## 备份与恢复

```powershell
corepack pnpm backup
corepack pnpm restore:drill --backup <备份目录或下载的JSON> --target <全新目录>
```

CLI 读取 `.env.local` 的持久化目录。在线备份包含一致 SQLite 快照、上传媒体、版本和 SHA-256 清单；单个备份最多 128 MiB。恢复拒绝覆盖已有目录，恢复出的管理员会话会失效。上线及真正替换数据的流程见 [部署和回滚](docs/DEPLOYMENT.md)。

## 三个独立阶段

| 阶段 | 范围 | 当前边界 |
| --- | --- | --- |
| P1 主站 | 页面、作品、Studio、SEO、基础工具、媒体与备份 | 不依赖第三方账号或 API 启动 |
| P2 用户 | WordPress/子比身份、QQ 优先登录、绑定、签到和积分 | 待完善；普通用户不会成为 Studio 管理员 |
| P3 扩展 | 小游戏角色/战绩、QQ 机器人、博客摘要、EdgeOne/GitHub 数据和进一步工具 | 待完善；业务服务分别拥有权威数据 |

访问统计、外部集成与统一用户页面会明确显示“待完善”。IP 工具只做本地地址格式与常见类型检查，没有地理归属地数据；Word 格式转换与 HTML → Markdown 尚未接入。

## 仓库与进一步阅读

正式仓库：[duanap/duanap-hub](https://github.com/duanap/duanap-hub)，当前 Public。源码不包含数据库、上传媒体、密码、Token、运行报告或原型 ZIP。未选择开源许可证。

- [本次实现范围](docs/P1-LITTLE-SPACE-V44.md)
- [本地验收与限制](docs/P1-VALIDATION.md)
- [三阶段路线](docs/ROADMAP-V1.1.md)
- [完整需求基线](docs/REQUIREMENTS-V1.0.md)
- [架构](docs/ARCHITECTURE.md)
- [数据及 API](docs/DATA-AND-API.md)
- [部署、升级与回滚](docs/DEPLOYMENT.md)

本项目与旧主页仓库、生产 WordPress、游戏数据分开。旧数据导入、主域切换和现有生产数据库替换是单独的后续工作。
