# 数据模型与 API 边界

## P1 主站 SQLite

| 表 | 职责 |
| --- | --- |
| `site_settings` | 全站资料、社交链接、首页布局、SEO、工具文案与备案等 JSON 配置 |
| `module_settings` | 已注册模块的启停和位置 |
| `projects` | 公开项目、游戏分类、手动状态、版本、slug 和 SEO |
| `project_entries` | 更新日志、更新预告、维护公告、路线图等内容记录 |
| `project_aliases` | 项目历史 slug → 项目 ID，保留发布后的永久重定向 |
| `admin_sessions` | 独立 Studio 管理员的短期会话 hash |
| `admin_login_attempts` | 登录失败限速 |

`published` 控制对外可见；`status` 只是手动运营状态。未发布项目不得列入公开列表或 Sitemap。内容日志同样区分草稿与已发布；公开查询/RSS 还要求 `effective_at` 已生效。排期为 ISO 时间，后台标注 UTC；取消尚未生效的排期后使用当前发布时间。

项目字段包括 `icon_url`、`cover_url`、`group_name`、JSON `tags`/`screenshots`、`version_date` 和 `sort_order`；公告增加 `roadmap_status`、`version`、`effective_at`。初始 Hub 模式使用增量 ALTER 升级，`user_version=1`；拒绝更新版本的数据库，不导入任何旧站模式。

数据库路径 `HUB_DATA_DIR/hub.sqlite`，默认开发 `./data/hub.sqlite`。启用 WAL 与外键；一个持久化目录只允许一个应用进程。媒体位于 `media/`、在线归档位于 `backups/`；恢复流程见 `BACKUP-RESTORE.md`。

## P2 WordPress 主权威

用户账号、第三方身份、`hub_uid`、积分、签到及积分流水归 WordPress + 子比。`hub_uid` 应作为跨应用稳定 ID，禁止用昵称、头像、第三方资料相似性自动合并账号。

桥接插件接口草案（**未来方案，starter 未实现**）：

```
GET  /wp-json/duanap-hub/v1/me
GET  /wp-json/duanap-hub/v1/me/points
GET  /wp-json/duanap-hub/v1/me/checkin
POST /wp-json/duanap-hub/v1/me/checkin
GET  /wp-json/duanap-hub/v1/me/points/history
POST /wp-json/duanap-hub/v1/bot/bind
POST /wp-json/duanap-hub/v1/rewards/grant
```

所有业务发奖带唯一事件 ID，由 WordPress 事务与数据库唯一约束防重复。签到按北京时间每天一次。QQ Bot ID 与 QQ 网页登录 OpenID 不能默认相等；机器人身份需经绑定码验证。

## P3 扩展接口

游戏各自拥有角色/房间/战绩数据库；跨端游戏访问相同游戏规则服务，服务端授权映射到 `hub_uid`。WordPress 只维护统一积分，不承担每次战斗或牌局高频写入。

WordPress 文章同步 API、EdgeOne/GitHub 数据接口只有读取与带时间戳缓存权限；外部调用超时返回 last-known-good 数据或“不可用”，不得阻塞门户。

## P1 API

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| POST | `/api/studio/login` | 独立管理员登录 |
| POST | `/api/studio/logout` | 注销当前后台会话 |
| PUT | `/api/studio/site` | 编辑站点设置 |
| PATCH | `/api/studio/modules` | 运行时启停/排序已注册模块 |
| POST | `/api/studio/projects` | 新增项目 |
| PATCH/DELETE | `/api/studio/projects/[id]` | 编辑或删除项目 |
| POST | `/api/studio/entries` | 新增项目日志/公告 |
| PATCH/DELETE | `/api/studio/entries/[id]` | 更新/删除日志 |
| GET/POST | `/api/studio/media` | 管理员媒体列表/上传 |
| DELETE | `/api/studio/media/[name]` | 删除未被内容引用的媒体 |
| GET | `/media/[name]` | 公开只读 WebP，随机文件名、不可变缓存 |
| GET/POST | `/api/studio/backups` | 管理员归档列表/创建在线快照 |
| GET | `/api/studio/backups/[name]` | 管理员下载归档，不缓存 |
| GET | `/api/health` | 最小健康检查，不泄漏机密 |

写 API 必须完成管理员认证、CSRF Origin 验证、输入校验；公网访问须 HTTPS。

请求体以流读取并限制大小，避免先完整缓冲超大输入。JSON 资料上限 50 KB、项目 200 KB、公告 80 KB；上传接受 5 MiB 图片并为 multipart 边界保留 64 KiB。图片解码后重编码 WebP，GIF 使用首帧；不接受 SVG/任意文件上传。
