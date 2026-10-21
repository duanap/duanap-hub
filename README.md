# duanap Hub

本地候选新增 Notes 等高四行弹窗、明确发布入口、友链信息获取/分类复用及音频文件上传；[本轮验收与上线条件](docs/NOTES-LINKS-AUDIO-2026-10-21.md)。尚未替换下述正式运行版本。

> **当前方向（2026-10-21 用户调整）：独立复刻 Zyyo。** 首页、歌曲库、自定义图标、朋友圈文案、相册和照片由后台管理，不自动从旧项目生成内容。运行版 `1eef9e8` 已按用户批准发布到 duanap.cn，保留原数据及回退备份；[本轮发布与验收](docs/REPLICA-ACCEPTANCE-2026-10-21.md) 和 [独立复刻范围](docs/REPLICA-SCOPE.md) 优先于下方历史 P1/P2/P3 记录。

> 一个小而美、可持续扩展的个人数字门户。**独立新项目 · P1 已部署（全新数据）**。

`duanap.cn` 是个人品牌与作品的主要入口：个人介绍、项目/游戏介绍、手动维护的版本和公告、在线工具、SEO 与 RSS，以及轻量卡片化管理后台 `duanap Studio`。

## 开发状态与承诺边界

**2026-10-21 已发布：** 复刻动态布局已通过服务器候选与公网验收，运行版本 `a8b057a`，保留原有三个正式项目、十张图片、会员、环境及模块开关。数据库为schema 2，匹配旧版备份和回退路径已保留；[最终发布与验收记录](docs/RELEASE-LAYOUT-2026-10-21.md) 优先于下方历史批次说明。

**发布整合：** 复刻版已对齐当前主线，保留线上已有会员、QQ/博客关联、签到、工具和数据卡片；服务器基线为 `222a106`。此前74项为独立布局批次，整合后的检查矩阵和切换边界以 [2026-10-21 发布记录](docs/RELEASE-LAYOUT-2026-10-21.md) 为准。

**2026-10-21 当前工作树：** 六页复刻已接入动态管理，独立相册/随记/友链、首页13卡片编排、站点歌单和可选 WordPress 文章摘要已完成本地验收。62项离线生产浏览器/API + 11项备份恢复 + 1项环境检查通过，尚未部署本批。使用方式与边界见 [动态站本地验收](docs/LOCAL-DYNAMIC-ACCEPTANCE.md)。以下生产记录对应历史已发布版本。

本仓库已完成 **P1 主站本地验收与主域部署**：项目运营、媒体管理、首页编排、Studio 编辑体验、SEO、基础工具和备份恢复。2026-10-13 在生产构建与服务器外部请求被阻断的条件下，26 项浏览器/API 用例通过；另有 6 项备份恢复和 1 项密码环境回归用例通过。按用户选择使用全新数据目录部署，保留原发布和数据供回滚；旧项目未导入。

主站：[duanap.cn](https://duanap.cn/)；[www.duanap.cn](https://www.duanap.cn/) 跳转主域；后台：[Studio 登录](https://duanap.cn/duanap/login)。服务器构建、真实备份恢复、HTTPS、私有缓存头和 EdgeOne 静态缓存均已验证，见 [部署记录](docs/DEPLOYMENT-2026-10-13.md)。管理员凭据只在服务器私有环境维护。

第二阶段接入 `blog.duanap.cn` 的 WordPress/子比用户与积分；第三阶段逐个接入游戏、QQ 机器人、博客文章及 EdgeOne/GitHub 数据。上述扩展服务在第一阶段**不是运行依赖**。

P3 首批提供博客公开摘要、分类、封面与综合 RSS。服务器设置 `HUB_CONTENT_WORDPRESS_URL` 后，在 Studio“博客动态”启用、同步并编辑卡片；数据独立缓存，博客失败不阻塞首页。实现与验收见 [博客摘要模块](docs/P3-CONTENT-2026-10-16.md)。

P3 第二批提供浏览器本地文档转换、公网 IP 查询、逐工具帮助/SEO/启停、通用首页区域尺寸和匿名 GitHub 卡片；入口为 Studio“工具配置”“GitHub 动态”“模块管理”。Word 仅支持 DOCX，IP 查询需用户同意第三方服务；见 [工具与 Widget 发布](docs/P3-TOOLS-WIDGETS-2026-10-17.md)。

2026-10-14 已完成 P2-1 Bridge 与 P2-2 登录/独立会话/只读账号中心的隔离候选，默认关闭且未生产发布。账号专项 23/23、Core 36/36、恢复 7/7；真实隔离 WordPress/Bridge HTTPS 链路 16 项通过。完整子比/QQ/Redis、绑定和统一签到仍待验收，详见 [P2-2 记录与配置](docs/P2-ACCOUNTS-2026-10-14.md)。账号测试使用 `npx playwright test -c playwright.accounts.config.ts`，不加入普通 Core 测试实例。

## 三阶段交付

| 阶段 | 内容 | 必须满足的交付条件 |
| --- | --- | --- |
| P1 主站 | 主页、项目/版本/公告、duanap Studio、模块、SEO、基础工具 | 无账号/博客/游戏/EdgeOne API 也可独立访问并上线 |
| P2 用户 | WordPress 身份、QQ 优先登录、绑定、积分及三端签到接口 | WordPress 故障时公开门户继续正常访问 |
| P3 扩展 | 游戏、机器人、博客文章、EdgeOne、GitHub、更多工具 | 每个扩展独立启停/维护，核心不受影响 |

详见 [三阶段开发计划](docs/ROADMAP-V1.1.md) 与 [完整需求基线](docs/REQUIREMENTS-V1.0.md)。

## 技术选择

当前工作树已增加本地相册、个人随记和友链管理（尚未发布生产）。Studio 的「相册管理」「个人随记」「友链管理」支持草稿、发布、排序和媒体选择；随记还支持未来时间发布。公开页面继续保留已发布项目的派生内容，独立内容不依赖项目模块。详见 [实际完成状态](docs/DEVELOPMENT-STATUS.md)。

- Next.js 16 App Router / React 19 / TypeScript；Node.js 22+。
- 主站独立 SQLite（`better-sqlite3`）；WordPress 仍维持 MySQL/MariaDB。
- 自定义 CSS 组件，轻量卡片式后台，不引入大型 UI 系统。
- 宝塔 + Nginx + EdgeOne；**无 Docker、无强制 CI/GitHub Actions**。
- 模块注册与后台启停是运行时功能开关；**内部模块代码更新仍需重新构建**。独立游戏/机器人服务可不影响主站地维护。

## 本地开发

需要 Node.js 22+、npm、Git。Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
npm ci
node scripts/hash-password.mjs
npm run dev
```

将密码脚本生成的整行复制到 `.env.local`；其中美元符号已经转义，复制时保留反斜杠，避免 Next.js 环境变量展开破坏哈希。密码至少 12 位。然后打开：

- 主站：<http://127.0.0.1:1026/>
- 后台：<http://127.0.0.1:1026/duanap/login>
- 健康：<http://127.0.0.1:1026/api/health>
- 网站地图：<http://127.0.0.1:1026/sitemap.xml>
- RSS：<http://127.0.0.1:1026/feed.xml>

`HUB_SITE_URL` 必须与实际浏览器访问的源一致，本地默认 `http://127.0.0.1:1026`；生产使用 `https://duanap.cn`。公开内容可以在无管理员环境变量时启动，但后台登录会明确不可用。

```powershell
npm run typecheck
npm run build
npm run check:structural
npm run test:backup
npm run test:env
npm test
```

本地验证与尚未完成的生产门槛分别记录在 [实际完成状态](docs/DEVELOPMENT-STATUS.md) 和 [验收清单](docs/ACCEPTANCE.md)。

浏览器测试在端口 1027 启动独立实例，自动生成临时管理员凭据和 `.tmp/` 下的独立数据库，不读取开发或生产数据。Windows 默认使用已安装的 Microsoft Edge；其他平台先运行 `npx playwright install chromium`。可用 `HUB_TEST_BROWSER_CHANNEL` 指定其他已安装的 Chromium 浏览器通道。

测试生产构建（先执行 `npm run build`）在 PowerShell 中使用：

```powershell
$env:HUB_TEST_SERVER_MODE = 'production'
$env:HUB_TEST_OFFLINE = '1'
npm test
Remove-Item Env:HUB_TEST_SERVER_MODE
Remove-Item Env:HUB_TEST_OFFLINE
```

`HUB_TEST_OFFLINE=1` 让测试服务拒绝非回环地址的服务器 `fetch` 请求，用于验证 Core 不依赖第三方服务；该开关只用于测试。

## 内容与备份

Studio 可上传头像、项目封面/图标/截图，并管理项目分组、标签、版本日期、公告排期和路线图状态。首页项目数量、布局、动态、模块顺序和社交入口均可编辑。支持侧栏折叠、明暗主题，以及已经保存内容的桌面/手机首页预览。

图片上传接受最多 5 MiB 的 PNG/JPEG/WebP/GIF，解码后转为 WebP；GIF 使用首帧。持久化文件位于 `HUB_DATA_DIR`，不进入 Git。一个数据目录只允许一个应用进程。

后台「系统信息」可创建与下载数据库/媒体备份；恢复通过停止应用后的 CLI 执行，包含校验、维护锁和回滚副本。详见 [备份与恢复](docs/BACKUP-RESTORE.md)。

## 独立 GitHub 仓库

仓库：[duanap/duanap-hub](https://github.com/duanap/duanap-hub)，当前为 **Public**。项目简介：

> duanap Hub — 轻量模块化个人门户、项目运营、SEO、统一账号与跨端游戏工作台。

已有远端仓库，无需再次创建。使用本机 Git 克隆开发：

```powershell
git clone https://github.com/duanap/duanap-hub.git
Set-Location duanap-hub
```

仓库与旧项目完全隔离；分支及推送约定见 [仓库说明](docs/REPOSITORY.md)。

## 阅读顺序

1. [开发路线与每阶段上线条件](docs/ROADMAP-V1.1.md)
2. [职责、依赖与模块隔离](docs/ARCHITECTURE.md)
3. [后台与前台设计规范](docs/UI-UX.md)
4. [数据和接口契约](docs/DATA-AND-API.md)
5. [Codex 实施说明](AGENTS.md)
6. [本地、宝塔部署和迁移](docs/DEPLOYMENT.md)
7. [验收清单](docs/ACCEPTANCE.md)
8. [实际完成状态和待验证事项](docs/DEVELOPMENT-STATUS.md)
9. [旧站源码核查与迁移准备](docs/MIGRATION-AUDIT.md)

## 旧项目边界

本仓库既不覆盖 `duanap/duanap-index`，也不覆盖 `duanap/index`；不连接生产 WordPress；初次启动不会导入生产账号、积分、文章或游戏数据。实际生产代码来源、数据库备份、子比版本及 OIDC 能力在迁移前必须只读核实。

尚未选择开源许可证；公开源码不代表已经授予开源许可。许可证由项目所有者决定。
