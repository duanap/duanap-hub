# 独立 GitHub 仓库与分支策略

- 仓库：[duanap/duanap-hub](https://github.com/duanap/duanap-hub)，当前可见性 Public。
- 描述：`duanap Hub — 轻量模块化个人门户、项目运营、SEO、统一账号与跨端游戏工作台。`
- 仓库不承接旧项目的提交历史、敏感配置和生产 SQLite 数据；保留文档中的迁移与来源引用即可。
- `main`：v0.1.0 开发包起点，不代表已经通过 P1 上线验收；后续合入增量前完成对应本地检查。
- 开发分支使用 `codex/` 前缀，例如 `codex/stage1-studio`、`codex/stage1-projects`。
- 不要求 GitHub Actions / CI；本地 `npm run typecheck`、`npm run build` 和专项测试作为合并验收。
- 版本按 `v0.1.0` 起步；发布生产后再由实际验收状态决定 `v1.0.0`。

## 本机开发

远端已经存在，使用本机 Git 克隆即可：

```powershell
git clone https://github.com/duanap/duanap-hub.git
Set-Location duanap-hub
git switch -c codex/stage1-studio
```

使用本机 `git` / `gh` 或 GitHub Desktop 推送。需要登录时使用官方客户端的登录流程，不把凭据写进远端 URL、源码或配置示例。

## 提交和发布边界

- 初始源码来自 v0.1.0 ZIP，导入时不覆盖本机已有 `.git`，不导入压缩包内 Git 钩子、身份配置或历史。
- 提交前查看暂存区的 diff，确认没有 `.env.local`、数据库、媒体、备份或凭据。
- 本机环境检查记录、未审阅计划及个人绝对路径不随初始开发包提交。
- 不强制创建 CI，不创建付费 GitHub 功能，不替项目选择许可证。
- 推送源码不是生产部署；替换现有主站及生产数据导入需要单独决定。

仓库创建后可在 GitHub Settings 中调整描述和 Topics，建议 Topics：`nextjs` `typescript` `personal-website` `wordpress` `seo` `modular-monolith`。

需要撤回后续代码时，使用 `git revert <commit>` 保留远端历史，不对主分支强制推送。
