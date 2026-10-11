# duanap Hub 首次生产部署

2026-10-11，所有者授权使用 `duanap.cn`、`www.duanap.cn`，在 `/www/wwwroot` 新建目录部署。main 未合并；发布来自 `codex/little-space-v44-p1`。版本 0.2.0，源码提交 `74568f5ef07c1076aae752bb6210264f210c89a3`；完整 SHA 同时保存在服务器 `current/DEPLOYED_COMMIT`。

## 实际环境与路径

| 项目 | 实际值 |
| --- | --- |
| SSH | `ssh duanap-server` |
| 系统 | 实测 Debian 12；历史 Ubuntu 描述不适用于本次环境 |
| Node | `/opt/v24.21.0/bin/node`，24.21.0 |
| 包管理器 | Corepack / pnpm 11.25.0；固定锁文件 |
| 主站 | https://duanap.cn |
| 别名 | https://www.duanap.cn，308 到主域，保留路径和查询参数 |
| 后台 | https://duanap.cn/duanap/login |
| 发布目录 | `/www/wwwroot/duanap-hub/releases/<完整提交SHA>` |
| 当前发布 | `/www/wwwroot/duanap-hub/current` 符号链接 |
| 环境配置 | `/www/wwwroot/duanap-hub/shared/.env.local`，0600；发布目录通过符号链接读取 |
| 数据 | `/www/wwwroot/duanap-hub/shared/data`，0700，运行用户 www |
| 进程 | `duanap-hub.service`，www：www，开机自启，失败重启 |
| 应用端口 | 仅 `127.0.0.1:1026` |
| Nginx | `/www/server/panel/vhost/nginx/duanap-hub.conf` |
| 日志 | `journalctl -u duanap-hub`；`/www/wwwlogs/duanap-hub.access.log`、`duanap-hub.error.log` |
| 部署前备份 | `/var/backups/duanap-hub/20261011-initial`，0700 |

部署前两个域名均返回 Nginx 默认占位页；没有对应 Hub 服务或域名虚拟主机。备份了默认配置、默认页面、主 Nginx 配置和服务/端口清单。新增独立目录、服务及虚拟主机，没有覆盖旧站源码、数据库，亦未修改其他域名配置、DNS、EdgeOne 或 GitHub main。

TLS 复用已有证书 `/www/server/panel/vhost/cert/lumirror.duanap.cn/{fullchain.pem,privkey.pem}`；证书实际覆盖 `duanap.cn` 与 `*.duanap.cn`，到期日 2027-01-07。后续续期需保持这一路径或同步更新 Hub 配置，不要只根据目录名判断证书覆盖范围。

Nginx 覆盖 Host、X-Real-IP 与转发头，关闭代理缓存。EdgeOne 可用 HTTP 回源，因此回源不会对 apex HTTP 强制跳 HTTPS；浏览器公开入口及 canonical 为 HTTPS。`www` 始终跳转到 HTTPS 主域。现有 EdgeOne 主域规则已对动态内容禁缓存，本次未改动它。该规则将浏览器 Cache-Control 改写为 `max-age=0`；后台源站为 `private, no-store`，公网检查为 MISS，匿名后台/备份请求仍被拒绝。

systemd 使用 www 用户、0077 umask、NoNewPrivileges、PrivateTmp、ProtectSystem=strict、ProtectHome；可写范围限定为 shared 与 Next 缓存。Next.js 正常 SIGTERM 停止返回 143，将其列为 SuccessExitStatus；实际重启显示 Deactivated successfully，避免正常维护被记为失败。SQLite、环境文件和备份不在公开静态目录。

## 管理员及内容

首次随机生成独立管理员，用户名 `duanap`，初始密码只写入服务器受限文件 `/var/backups/duanap-hub/20261011-initial/studio-initial-login.txt`，未输出到工具日志或 GitHub。所有者可通过 SSH 在自己的终端读取。

改密码：在服务器交互终端执行 `node scripts/hash-password.mjs`，把输出的整行写入 shared `.env.local`，保留 `\$` 转义，然后重启 Hub。不要把环境文件当 shell 脚本 source。首次上线验收发现未转义 `$` 被 Next.js dotenv 展开，已经备份原配置并修复；密码未改变，脚本已修正，新增回归测试使用真实 Next.js 加载器验证。

站点创建全新 Hub SQLite。当前项目、游戏和上传媒体均为 0，展示真实空状态；没有导入旧站数据或注入示例作品。管理员可通过 Studio 录入正式内容。P2/P3 与统计保持“待完善”。

## 验证范围

- Linux：锁定依赖及 SQLite/Sharp 原生模块安装、类型检查、生产构建通过；最终提交的 21 项回归全部通过。分享图宽高改为数值，构建不再出现该属性警告。
- Linux 隔离生产启动：无第三方服务/管理员密码，13 条路由、真实 SSR 正文和运行时 canonical 通过。
- 服务、仅回环端口、带正确 Host 的 TLS 源站、公网 HTTPS/EdgeOne 分别验证；健康接口返回 `ok=true`、`version=0.2.0`。
- 12 条实际公网路由 200：首页、关于、项目、游戏、工具、密码工具、robots、sitemap、feed、分享图、登录、health；`www` 路径与查询参数跳转通过。
- 公网管理员登录、Secure/HttpOnly Cookie、工作台访问、原值保存、在线备份通过；匿名编辑 401、跨域编辑 403、匿名备份 401。
- 保存之前先创建 Hub 在线备份，生产内容不变；恢复到全新 `/www/wwwroot/duanap-hub/shared/restore-drill-20261011`，核验哈希/数据库/格式通过，项目 0、媒体 0；生产库未覆盖。
- 服务重启后 health、SQLite 和后台设置保留。NRestarts=0；外部请求 `/.env` 被 Nginx 规则拒绝，未暴露环境文件。

本地浏览器已完成 375/390/430/768/1440px 的 35 个实际公网页面组合，无横向溢出。实际生产 CSS 验收发现压缩器从重复的手写前缀声明中只保留 `-webkit-backdrop-filter`；移除重复声明、让压缩器从标准属性生成兼容前缀后，标准模糊属性得到保留。完整 16 项浏览器测试随后使用 `next start` 及隔离数据重新执行，全部通过；测试服务同时固定为测试运行器的 Node，避免 PATH 意外选择不同 ABI 的 Node。

最终 Linux 发布后再次完成上述 35 个公网页面组合，并单独验证手机五项导航、实际标准顶部模糊、深浅主题切换、真实 JSON 输入美化，页面异常 0；桌面与手机截图已目视核对，保存在本机忽略的 `.tmp/deploy/live-home-1440.png`、`live-home-390.png`。此公网验收只操作浏览器本地输入，不创建演示作品。原 PZJG 和 Lumirror 公网 health 仍正常。

原 P1 完整交互测试在隔离数据库执行，不把验收项目/上传图片写进生产库。生产中未做演示作品发布、旧 URL 迁移、旧库替换、真实外部集成或统计验证。

## 维护及回滚

```sh
ssh duanap-server
systemctl status duanap-hub --no-pager
journalctl -u duanap-hub -n 50 --no-pager
curl -fsS http://127.0.0.1:1026/api/health
cat /www/wwwroot/duanap-hub/current/DEPLOYED_COMMIT
```

新发布：上传经检查的 Git 提交到新 releases 目录，在 Linux 安装固定依赖、链接 shared 环境、检查/构建；保留当前代码及在线数据备份。构建通过后原子切换 current 并重启服务，验证源站与公网。不要复制 Windows node_modules。

恢复部署前默认域名路由：

```sh
ssh duanap-server 'bash /var/backups/duanap-hub/20261011-initial/rollback.sh'
```

该脚本将新增 Hub Nginx 文件移入私有备份目录，运行 nginx -t 并重载，然后停止并取消 Hub 自启；默认站点仍保留，两个域名回到部署前路由。所有发布目录、凭据和 Hub 数据保留，不删除或覆盖数据库。脚本已审查与语法检查，为避免打断上线服务，未在生产实际执行。执行后需重新核对默认页、域名和其他站点健康。

代码回滚可把 current 指向保留的兼容版本并重启；跨 schema 或恢复上线后数据需先备份，在新目录恢复验证，再另获批准切换。main 合并、旧站数据导入及生产数据库覆盖均未执行。
