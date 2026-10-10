# 开发、宝塔部署、备份与迁移

## 开发环境

- Node.js >=22；建议与依赖版本匹配。
- `.env.example` 复制为 `.env.local`；`HUB_SITE_URL` 与浏览器实际 Origin 保持一致。
- `HUB_ADMIN_PASSWORD_HASH` 使用 `node scripts/hash-password.mjs` 交互式生成；不把明文密码放进 Git。
- `npm install` 后运行 `npm run dev`；首次请求会自动创建本地 SQLite 数据文件。

## 独立测试部署

优先使用未占用的 1026 端口，在 Nginx 配置新的测试域名或仅内部端口。保留 `duanap.cn` 现有站点和现有 `duanap-index`/Astro 项目运行状态。

准备 Node.js 22、持久化目录、`.env.local`，执行 `npm install`、`npm run build`、`npm start`。宝塔 Node 项目设置工作目录为新源码，运行命令 `npm start`，转发到 `127.0.0.1:1026`。EdgeOne/CDN 应将 `/duanap`、`/api/`、所有登录回调标记为不缓存；静态公开资源可以缓存。实际 HTTPS 域名必须正确填写到 `HUB_SITE_URL`。

## 上线前迁移

1. 只读确认当前生产主域名的仓库、版本、Node/PHP 服务和数据库真实路径。
2. 备份生产文件、数据库及媒体，验证备份可恢复。
3. 针对旧 `site_settings`、`links`、项目入口确定字段映射；先在隔离数据库上做迁移演练。
4. 对照历史 URL 生成 301 计划，逐页验证 canonical、robots、Sitemap、RSS。
5. 独立新站完成 `ACCEPTANCE.md` 后，才考虑 Nginx 上线切换；保留原版本与回滚配置。

**注意：** 当前 starter 的数据库与 `duanap-index` 并不兼容；没有自动导入脚本，也不能把旧 `duanap.db` 直接改名放进来。

## 备份

开发期数据库可在关闭应用后复制完整 `data/` 目录；生产服务运行时请使用 SQLite 在线安全备份（例如 SQLite Backup API 或明确管理 WAL 一致性的工具），不要仅拷贝主 `.db` 文件。恢复演练还需核验媒体和配置。

## 无 CI 限制

本仓库默认不含 `.github/workflows`。本地检查清单：`npm run typecheck`、`npm run build`、`npm run check:structural` 及功能验收。
