# P1 独立部署、数据升级与回滚

本次只完成本地开发与验证；没有修改生产服务器、Nginx、DNS、EdgeOne 或现有数据库。部署及主分支合并待所有者确认。以下是部署步骤，示例路径与域名必须按已核实的运行环境替换。

## 1. 准备独立发布

先通过 `ssh duanap-server` 只读核实 Node、当前站点服务、占用端口、Git 提交、Nginx Host、运行用户和真实持久化目录。仓库主站使用 Node.js 22.13+；本轮验证环境是 Windows / Node.js 24.19.0，目标 Linux 主机仍需安装和启动检查。

建议保留发布目录和共享数据：

```text
/srv/apps/duanap-hub/
  releases/<commit>/       源码、依赖和 .next 构建
  current -> releases/... 当前运行版本
  shared/data/            hub.sqlite、media、backups、migration-backups
```

首次创建 Hub 测试服务，与旧主站保留各自工作目录和数据库。1026 只是默认端口，使用前确认没有冲突。站点数据目录采用绝对路径；运行用户需有目录读写权限，私有目录建议 0700、私有文件 0600。

```sh
cd /srv/apps/duanap-hub/releases/<commit>
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
cp .env.example .env.local
node scripts/hash-password.mjs
```

随后在服务器本地填写受保护的 `.env.local`：

```dotenv
HUB_SITE_URL=https://<批准的测试域名>
HUB_DATA_DIR=/srv/apps/duanap-hub/shared/data
HUB_ADMIN_USERNAME=<管理员名称>
HUB_ADMIN_PASSWORD_HASH=<交互脚本生成的哈希>
HUB_TRUST_PROXY=1
NEXT_TELEMETRY_DISABLED=1
```

密码脚本要求交互终端；不把密码、哈希、数据库、备份或服务器配置上传 GitHub。默认部署保留完整固定依赖，以运行 TypeScript 备份/恢复 CLI。

## 2. 启动与 Nginx

宝塔 Node 项目：工作目录指向 `current`，启动命令 `corepack pnpm start`，进程监听 `127.0.0.1:1026`。也可用现有 systemd 管理方式，保持工作目录、环境配置和持久化路径一致。没有 Docker 或 CI 依赖。

Nginx 配置应在修改前备份现有文件；对独立测试域名使用以下核心反代设置：

```nginx
location / {
    proxy_pass http://127.0.0.1:1026;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
}
```

`HUB_TRUST_PROXY=1` 仅用于这一可信回环反代，Nginx 必须覆盖 `X-Real-IP`；应用端口不能直接公开。未启用可信反代时登录使用受限的共享尝试桶，不接受客户端自报 IP 作为绕过限速的依据。

`/_next/static/` 和不可变 `/media/<uuid>.webp` 可以缓存；HTML、Studio、账号页、Studio API、Sitemap、robots 和 Feed 保持不缓存，确保内容撤回和模块禁用的新请求立即生效。EdgeOne 的登录、后台与 API 必须设置为不缓存，保留 Set-Cookie。分享图和装饰静态素材可缓存。

在真正修改配置时先 `nginx -t`，通过后再重载。独立测试成功并不自动授权把旧 `duanap.cn` 切换到新应用。

## 3. 上线检查

必须在目标机器做一次冷启动与重启验证：

1. 本地 app health、运行服务状态、日志和端口正常。
2. 用正确 Host 访问 Nginx 源站，核对 canonical 和管理员登录 Origin。
3. 再独立验证公网 HTTPS/EdgeOne；源站 200 不等于公网配置正确。
4. 首页、关于、作品、已发布详情、游戏、全部启用工具可访问；维护中的已发布详情继续存在。
5. Studio 登录、保存、发布与撤回、上传、模块排序及禁用经过实际操作。
6. Sitemap 仅列当前公开路由；Feed 无草稿；分享图、备案和移动底栏正常。
7. 禁用全部可选模块后首页/后台/health/SEO 可用；未配置或不可用的 P2/P3 服务不成为启动依赖。
8. 创建真实备份，在新目录恢复并核对数据与媒体，重启后保存内容仍存在。

公网、证书、EdgeOne、旧链接迁移和真实生产数据恢复演练尚未执行；这些检查属于批准部署时的必要步骤。

## 4. SQLite 升级

原开发包数据库版本为 0。本版版本 1 添加项目/记录扩展 JSON、正文时间、旧 slug 重定向、工具配置和媒体表；原表与业务记录保留。

对已有 v0 数据库，应用先创建 `migration-backups/before-v1-<timestamp>.sqlite` 的一致快照，再执行幂等初始化和事务迁移。更高版本数据库在任何 DDL 前被拒绝，避免旧程序改写新格式。备份失败会阻止继续升级。

这仅兼容本 Hub 开发包数据，不兼容旧 `duanap-index` 或 Astro/EmDash 的数据库。不要直接复制旧生产 SQLite 或把其他项目数据库改名为 `hub.sqlite`。迁移其他站点需单独只读审计、字段映射、备份和授权。

## 5. 在线备份与恢复演练

Studio → 备份与恢复可创建和下载真实备份。CLI 与应用使用同一配置目录：

```sh
corepack pnpm backup
corepack pnpm restore:drill --backup <snapshot-directory-or-downloaded-json> --target <new-directory>
```

- SQLite backup API 捕获已提交 WAL 数据；不是直接拷贝活库文件。
- 备份包含该快照引用的不可变上传媒体及 SHA-256 清单，不包含管理员密码环境文件。
- 有效备份最多 128 MiB；更大的站点采用经核实的离线运维备份。
- 恢复核验路径、文件大小、哈希、数据库 integrity、版本和媒体引用。
- 目标目录必须不存在；已有目录一律拒绝覆盖。
- 恢复只写新目录，旧应用的数据不变；恢复库中的管理员会话和登录尝试状态被清除。
- 核对项目、公告、设置和图片之后，再由管理员决定停服切换数据目录。

恢复出的新目录不包含环境密码；启动验证仍使用受保护的环境配置。下载的备份具有敏感性，应由管理员自行保存到安全位置，不放在公开网站或仓库中。

## 6. 回滚

部署前记录旧发布路径、提交 SHA、环境配置位置、Nginx 配置备份，以及可恢复的数据快照。

若新版本异常：

1. 停止新 Hub 实例继续写入，先保存当前数据与日志。
2. 保留所有新旧发布目录和数据。把进程工作目录或 `current` 指回上一已验证发布；必要时恢复已备份的 Nginx 配置并运行 `nginx -t`。
3. 同 schema 的代码回滚可继续使用已核实的兼容数据；跨 schema 回滚必须先在新目录恢复对应版本快照并验证。
4. 替换生产数据库需所有者单独明确确认。保留回滚前数据，不静默覆盖或丢弃上线后新增记录。
5. 重启并重新验证服务、源站、公网、Studio 和核心路由。异常期间不继续做删除或破坏性操作。

当前可回到原开发包代码 `3d2b166`；若已使用本版新配置，旧代码回滚还需配套 v0 数据快照。不要只回退代码而假设旧版可以理解新格式设置。旧主站一直保留，是主域切换后的另一个回滚入口。

源码开发回滚使用新的 `git revert` 提交，不强制推送 main。未修改生产时，无生产状态需要回滚。
