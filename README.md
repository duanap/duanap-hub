# duanap Hub

> 一个小而美、可持续扩展的个人数字门户。**独立新项目 · 开发起点 v0.1.0**。

`duanap.cn` 是个人品牌与作品的主要入口：个人介绍、项目/游戏介绍、手动维护的版本和公告、在线工具、SEO 与 RSS，以及轻量卡片化管理后台 `duanap Studio`。

## 开发状态与承诺边界

本仓库当前是 **第一阶段开发骨架**，不是现有生产主站的替换包，也不是三个阶段的完成版。包含最小公开页面、SQLite 内容模型、模块启停骨架、独立后台基础身份、项目与公告编辑 API、SEO 及 RSS 示例。**仅为新项目开发基线**，上线前还须完成 `docs/ACCEPTANCE.md` 的验收及生产数据迁移。

第二阶段接入 `blog.duanap.cn` 的 WordPress/子比用户与积分；第三阶段逐个接入游戏、QQ 机器人、博客文章及 EdgeOne/GitHub 数据。上述扩展服务在第一阶段**不是运行依赖**。

## 三阶段交付

| 阶段 | 内容 | 必须满足的交付条件 |
| --- | --- | --- |
| P1 主站 | 主页、项目/版本/公告、duanap Studio、模块、SEO、基础工具 | 无账号/博客/游戏/EdgeOne API 也可独立访问并上线 |
| P2 用户 | WordPress 身份、QQ 优先登录、绑定、积分及三端签到接口 | WordPress 故障时公开门户继续正常访问 |
| P3 扩展 | 游戏、机器人、博客文章、EdgeOne、GitHub、更多工具 | 每个扩展独立启停/维护，核心不受影响 |

详见 [三阶段开发计划](docs/ROADMAP-V1.1.md) 与 [完整需求基线](docs/REQUIREMENTS-V1.0.md)。

## 技术选择

- Next.js 16 App Router / React 19 / TypeScript；Node.js 22。
- 主站独立 SQLite（`better-sqlite3`）；WordPress 仍维持 MySQL/MariaDB。
- 自定义 CSS 组件，轻量卡片式后台，不引入大型 UI 系统。
- 宝塔 + Nginx + EdgeOne；**无 Docker、无强制 CI/GitHub Actions**。
- 模块注册与后台启停是运行时功能开关；**内部模块代码更新仍需重新构建**。独立游戏/机器人服务可不影响主站地维护。

## 本地开发

需要 Node.js 22+、npm、Git。Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
npm install
node scripts/hash-password.mjs
npm run dev
```

将密码脚本生成的 `scrypt$...` 字符串复制到 `.env.local` 的 `HUB_ADMIN_PASSWORD_HASH`；密码至少 12 位。然后打开：

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
```

2026-10-10 本机已通过关键文件结构检查和密码脚本语法检查；未安装 TypeScript 时，结构检查会明确跳过 AST 解析。依赖安装、类型检查、Next.js 构建与浏览器验收仍待完成，验证通过后再上线。

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

## 旧项目边界

本仓库既不覆盖 `duanap/duanap-index`，也不覆盖 `duanap/index`；不连接生产 WordPress；初次启动不会导入生产账号、积分、文章或游戏数据。实际生产代码来源、数据库备份、子比版本及 OIDC 能力在迁移前必须只读核实。

尚未选择开源许可证；公开源码不代表已经授予开源许可。许可证由项目所有者决定。
