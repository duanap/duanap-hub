# Little Space V4.4 P1 实施与验收

日期：2026-10-11。用户已明确要求持续完成开发、提交并推送独立分支；不合并 main，不部署生产。此任务替代此前待审阅的 P1 计划，以本次正式任务及 V4.4 实际 HTML/JS/CSS 为准。

## 基线检查

- 正式仓库基线：`3d2b166`；本地与 origin/main 一致，分支 `codex/little-space-v44-p1`。
- 原项目：Next.js 16.2.12、React 19.2.0、SQLite WAL，独立管理员会话；已有首页、About、Projects、Games、Tools、Studio、写 API、SEO/RSS。
- 原数据表：site_settings、module_settings、projects、project_entries、admin_sessions、admin_login_attempts。工作目录没有生产数据库，不调用生产系统。
- 已审阅原型 README、AGENTS、CODEX-HANDOFF、DESIGN-SPEC，并核对实际代码。旧 V4.1/V4.2 标题不是本次视觉版本依据。
- 原型只提供视觉和流程，不采用 localStorage 业务数据、演示积分、版本或统计。素材中的游戏画面仅作为可选设计素材，不自动当作真实截图发布。

## 实施顺序

1. 公共布局与组件：暖白/蓝色、小而精的卡片、兔子插画、1120px 容器、五项移动导航、主题、滚动模糊、备案。
2. 首页与作品：SQLite 驱动的配置和发布内容、模块排序/禁用、搜索分类、项目四个栏目、截图预览。
3. 项目管理：兼容增量迁移，人工状态/版本/维护说明，日志和计划持久化，旧 slug 重定向。
4. 工具：安全密码、JSON、Unicode Base64、时间戳、IP 本地检查、可信 Markdown 渲染/导出；按服务端开关启停。
5. Studio：现有鉴权不变，真实内容 CRUD、模块/工具/备案/SEO/主题、媒体上传、SQLite 安全备份与恢复演练。外部集成/访问统计/用户数据明确待完善。
6. SEO 与交付：SSR、动态 metadata/canonical/OG/JSON-LD、robots/Sitemap/RSS；完整本地验收、部署与回滚文档、开发分支提交推送。

## 数据与安全

新字段通过幂等 ALTER/新表增加，不清空旧表。媒体仅允许验证过的 JPEG/PNG/WebP/GIF，最多 5 MiB，存储于 HUB_DATA_DIR。JSON/上传在读取期间限制大小；后台所有读写需要管理员会话，改写校验 Origin。备份使用 SQLite backup API，包含媒体和校验清单；恢复演练只写新目录，真正替换数据需停服并另行确认。

## 验收重点

每组运行类型检查、生产构建和针对性交互检查。最终检查 375/390/430/768/1440px，无全页横向溢出；移动底栏不遮挡内容；Studio 更多抽屉可关闭并恢复焦点；保存失败不丢草稿；禁用后新请求的导航、页面、Sitemap、Feed 一致。草稿不公开，维护不移除已发布项目。所有第三方断网时 Core 可用；密码和工具输入不上传。迁移旧开发库和真实 WAL 备份恢复有测试。

## 进度

- [x] 审核正式仓库与原型、建立开发分支。
- [x] 基线安装/类型/构建。
- [x] 公共布局、首页与作品。
- [x] 项目模型与管理。
- [x] 工具与 Studio。
- [x] 媒体、备份、SEO、全面验收。
- [x] 独立审阅与回归修复。

源码提交与远端同步以 Git 记录为准；不代表生产部署或 main 合并。

执行记录与具体测试结果持续写入 `docs/P1-VALIDATION.md`。
