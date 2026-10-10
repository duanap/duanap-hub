# duanap Hub · Codex 开发约束

优先阅读 `docs/ROADMAP-V1.1.md`、`docs/ARCHITECTURE.md`、`docs/REQUIREMENTS-V1.0.md`、`docs/ACCEPTANCE.md`。本仓库是**独立新项目**，与 `duanap/duanap-index`、`duanap/index`、WordPress 生产站隔离。

## 当前开发优先级

1. **先 P1，再 P2，再 P3。** P1 功能须可正式独立上线；不要在 P1 强制引入 QQ OAuth、子比、游戏、EdgeOne API。
2. 优先完整完成主站、项目运营、首页编排、duanap Studio、SEO、基础工具、备份与迁移。
3. 运营状态完全由后台人工编辑，不代表自动健康检测。显示和发布状态分别建模。
4. 所有展示内容尽量可后台编辑；复杂新模块可以代码部署，模块配置通过数据库控制。
5. 功能代码设计应易读，避免通用插件商城、DI 容器、繁复抽象、大型 UI/状态库、微服务或不必要第三方服务。

## 不可破坏约束

- Core 不依赖扩展 API 启动。WordPress/游戏/EdgeOne 故障时首页、项目、后台、SEO 仍可工作。
- 不复制旧生产 SQLite、不自动迁移或覆盖正在运行的站点。
- 保持敏感信息在服务器端 `.env.local` 与受控持久化目录；不提交密码、Token、用户数据。
- 账号、签到积分归 WordPress 权威；游戏角色与战绩归游戏服务；主站只持有明确的本地内容数据。
- Studio 管理员独立鉴权；普通用户身份不能直接映射管理员权限。
- 对修改代码执行有针对性的本地检查，发现 npm 依赖不可用时明确记录无法完成的检查，不假称已通过。
- 不强制使用 GitHub Actions、付费 GitHub 功能、Docker/Kubernetes 或 CI；上线按宝塔/Nginx 现有习惯实现。
- 每次提交说明修改文件、验证结果、已知限制和下一步；无需设计无用文档或过度工程化。

## 验收标准

每阶段：公开首页、公开内容、后台、robots/sitemap/feed 可用；关掉所有可选模块仍可访问核心；模拟第三方失败不影响 Core；有本地备份和回滚方案。具体见 `docs/ACCEPTANCE.md`。

## 最初 Codex 任务

开始 P1：先审查当前开发包与 `duanap-index` 的可复用实现，设计最小安全迁移策略。然后以可运行、可验收的顺序补全卡片化 Studio、项目更新与公告管理、首页模块编排、SEO、媒体与备份。将旧站数据导入视为独立经批准的任务。
