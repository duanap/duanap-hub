# duanap Hub

> 一个小而美、可持续扩展的个人数字门户。**独立新项目 · P1 已部署（全新数据）· P2 账号与统一签到已启用，外部验收未完成**。

`duanap.cn` 是个人品牌与作品的主要入口：个人介绍、项目/游戏介绍、手动维护的版本和公告、在线工具、SEO 与 RSS，以及轻量卡片化管理后台 `duanap Studio`。

## 开发状态与承诺边界

本仓库已完成 **P1 主站本地验收与主域部署**：项目运营、媒体管理、首页编排、Studio 编辑体验、SEO、基础工具和备份恢复。2026-10-13 在生产构建与服务器外部请求被阻断的条件下，26 项浏览器/API 用例通过；另有 6 项备份恢复和 1 项密码环境回归用例通过。按用户选择使用全新数据目录部署，保留原发布和数据供回滚；旧项目未导入。

主站：[duanap.cn](https://duanap.cn/)；[www.duanap.cn](https://www.duanap.cn/) 跳转主域；后台：[Studio 登录](https://duanap.cn/duanap/login)。服务器构建、真实备份恢复、HTTPS、私有缓存头和 EdgeOne 静态缓存均已验证，见 [部署记录](docs/DEPLOYMENT-2026-10-13.md)。管理员凭据只在服务器私有环境维护。

第二阶段已接入 `blog.duanap.cn` 的 WordPress/子比用户与积分；第三阶段计划逐个接入游戏、QQ 机器人、博客文章及 EdgeOne/GitHub 数据。上述扩展服务**不是 Core 启动依赖**。

### P2 当前生产状态（2026-10-16）

[PR #7](https://github.com/duanap/duanap-hub/pull/7) 已合并到 main，合并提交为 `0eed9f34f2696cfeec12182eefd8f3a1bb37aad1`。这与实际运行版本分别记录：主站运行 `1c6c955`，Bridge **0.3.3** 部署文件摘要对应源码 `7cde48d`，未因后续 PHP 修正重复构建 Next.js。

| 类别 | 已核对的状态与边界 |
| --- | --- |
| 已部署并启用 | Hub 普通用户账号、首页 QQ 登录入口、Hub 与 WordPress 统一签到；Provider/Bridge 已安装，普通用户与 Studio 独立鉴权 |
| 已完成生产验证 | Provider/PKCE、本人积分/流水/绑定读取、权限与私有配置隔离及 Core/SEO 28 项；标记合成账号的登录奖励及博客/Hub 混合并发 17 项；Bridge 停用/重新激活演练 7 项；组合备份仅恢复至新库并对账一致 |
| 隔离与本地证据 | 完整主题/WPOPT/真实独立 Redis 组合 275 项；Core 离线 43 项通过、2 项条件跳过；账号 34 项及写入关闭专项 1 项；备份 7 项、环境 1 项及构建/类型/结构检查通过。这些是既有记录，不代表真实第三方授权成功 |
| 尚待外部验收 | QQ 仍受未开通/审核中限制；真实邮件送达、GitHub/Gitee 真实授权与绑定冲突未验收，P2 全阶段正式验收未完成 |

QQ 入口先建立 Hub PKCE 事务，再委托博客本应用授权，成功后续接原事务；已验证跳转参数，尚无真实 QQ 授权成功证据。博客应用 `1905795653` 与主域应用 `102869604` 分离；主域 AppKey 未配置、QQ 回调转发关闭，不跨应用处理 code 或密钥。

功能回退收敛账号、QQ 入口及签到开关，保留 WordPress 用户事务保护、用户/UID/绑定/业务账本与当前 Studio 新密码；不恢复旧余额数据库、旧密码或旧 Redis 用户缓存前缀。关闭 Bridge 统一签到会恢复主题原生处理，冻结全部签到还须另关原生签到。回退脚本仅完成只读演练，执行后需重新授权；不把备份恢复演练作为覆盖生产库的许可。

完整证据与限制见 [10 月 16 日生产记录](docs/P2-PRODUCTION-2026-10-16.md)、[当前开发状态](docs/DEVELOPMENT-STATUS.md) 和 [分层验收清单](docs/ACCEPTANCE.md)。

### 历史隔离候选（2026-10-14）

以下为当日快照，不代表当前生产状态：2026-10-14 已完成 P2-1 Bridge 与 P2-2 登录/独立会话/只读账号中心的隔离候选，默认关闭且未生产发布。账号专项 23/23、Core 36/36、恢复 7/7；真实隔离 WordPress/Bridge HTTPS 链路 16 项通过。完整子比/QQ/Redis、绑定和统一签到仍待验收，详见 [P2-2 记录与配置](docs/P2-ACCOUNTS-2026-10-14.md)。

账号测试使用 `npx playwright test -c playwright.accounts.config.ts`，不加入普通 Core 测试实例。

## 三阶段交付

| 阶段 | 内容 | 必须满足的交付条件 |
| --- | --- | --- |
| P1 主站 | 主页、项目/版本/公告、duanap Studio、模块、SEO、基础工具 | 无账号/博客/游戏/EdgeOne API 也可独立访问并上线 |
| P2 用户 | WordPress 身份、QQ 优先登录、绑定、积分及三端签到接口 | WordPress 故障时公开门户继续正常访问 |
| P3 扩展 | 游戏、机器人、博客文章、EdgeOne、GitHub、更多工具 | 每个扩展独立启停/维护，核心不受影响 |

详见 [三阶段开发计划](docs/ROADMAP-V1.1.md) 与 [完整需求基线](docs/REQUIREMENTS-V1.0.md)。

## 技术选择

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
9. [P2 当前生产接入、验证与回退边界](docs/P2-PRODUCTION-2026-10-16.md)
10. [旧站源码核查与迁移准备](docs/MIGRATION-AUDIT.md)

## 旧项目边界

本仓库既不覆盖 `duanap/duanap-index`，也不覆盖 `duanap/index`。初次启动不会自动导入生产账号、积分、文章或游戏数据；P1 使用全新内容库的历史选择不变。当前 P2 已通过受控 Provider/Bridge 连接生产 WordPress，用户与积分仍以 WordPress 为权威，不复制到主站内容库。后续迁移仍须先只读核实来源、版本与一致备份；当前生产边界以 [10 月 16 日记录](docs/P2-PRODUCTION-2026-10-16.md) 为准。

尚未选择开源许可证；公开源码不代表已经授予开源许可。许可证由项目所有者决定。
