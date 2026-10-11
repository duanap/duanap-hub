# P1 数据与 API 契约

本版使用 SQLite schema 1。数据路径为 HUB_DATA_DIR/hub.sqlite，启用 WAL、外键与有限 busy timeout。业务内容不使用原型 localStorage；主题是设备偏好，sessionStorage 仅用于当前标签页的未保存草稿恢复，成功保存后清除。

## 主站数据

| 表 | 内容 |
| --- | --- |
| site_settings | 公开资料、首页文案、社交/备案、SEO、默认主题的 JSON |
| module_settings | 代码注册模块的启停和首页顺序 |
| projects | 项目正文、发布状态、人工运营状态、版本、地址、SEO、内容修改时间及扩展 JSON |
| project_entries | 每项目的日志、预告、公告、规则和开发计划；扩展 JSON 保存版本、进度与日期 |
| project_slug_redirects | 旧 slug 指向稳定项目 ID；草稿不会通过旧地址暴露 |
| tool_settings | 已实现工具的文案与公开开关 |
| media | 不可变上传图片的元信息；实际文件在 media/ |
| admin_sessions | 短期管理员会话的 hash 与到期时间 |
| admin_login_attempts | 有时限的登录尝试桶 |

项目扩展字段包含 iconUrl、group、tags、screenshots、sortOrder、versionDate、versionSummary、maintenanceMessage、allowEntryDuringMaintenance。发布状态控制可见性；运营状态由管理员填写，维护不会删除已发布详情。contentUpdatedAt 仅反映内容变化，不因状态轮询变化。

记录分 changelog、preview、notice、roadmap、rules。计划进度为 idea、planned、in-progress、done、paused；有效区间和预计日期可留空。时间戳保存 UTC，公开显示和公告生效判定使用北京时间。RSS 和动态列表先按实际生效日期过滤，再限制条数。

games 和 updates 依赖 projects。关闭游戏展示不会删除项目中心内的游戏项目；关闭最近动态不会删除项目详情内的历史记录。未实现的 P2/P3 注册模块不能启用。工具目录、独立路由和 Sitemap 使用同一工具开关。

## 管理接口

以下读接口需要独立管理员会话，改写还校验 Origin；响应不缓存。普通用户身份不会自动获得管理员权限。

| 方法 | 路径 | 行为 |
| --- | --- | --- |
| POST | /api/studio/login | 校验 scrypt 密码及失败限速，创建 HttpOnly 会话 |
| POST | /api/studio/logout | 注销当前会话 |
| PUT | /api/studio/site | 校验并保存站点设置 |
| PATCH | /api/studio/modules | 已注册模块启停或完整顺序 |
| POST | /api/studio/projects | 创建项目，默认草稿 |
| PATCH/DELETE | /api/studio/projects/[id] | 更新或显式删除项目与关联记录 |
| POST | /api/studio/entries | 创建关联项目的记录 |
| PATCH/DELETE | /api/studio/entries/[id] | 更新或显式删除记录 |
| PATCH | /api/studio/tools | 保存工具开关和文案 |
| GET/POST | /api/studio/media | 管理员媒体列表与图片上传 |
| GET/POST | /api/studio/backups | 备份历史与一致快照创建 |
| GET | /api/studio/backups/[id] | 下载经过校验的备份 JSON 包 |
| GET | /api/health | 无秘密的最小健康检查 |
| GET | /media/[filename] | 按已注册不可变 UUID 文件名读取公开图片 |

JSON 请求在读取过程中限制总字节，并采用字段白名单。图片最多 5 MiB / 20MP，仅接受验证后的 JPEG、PNG、WebP、GIF，重新编码 WebP；GIF 保存首帧，不接受 SVG/HTML。上传文件名不作为磁盘路径。当前没有批量媒体删除，防止破坏已有引用。

## 备份与升级

SQLite backup API 捕获一致快照和已提交 WAL。快照包含引用的媒体、schema 版本与 SHA-256 清单，最多 128 MiB。复制过程累计大小，失败只清理本次独占的 .pending 临时目录，保留所有已有有效备份。

恢复 CLI 校验清单、大小、路径、hash、integrity、版本与媒体引用，只写全新目录。恢复的管理员会话失效，不直接覆盖在线数据库。已有 v0 库先保留迁移前快照再改表；高版本库在 DDL 前拒绝。其他旧站数据库不自动导入。

## 后续业务边界

P2 用户、绑定、hub_uid、签到、积分和流水由 WordPress/子比权威提供；先验证实际主题与安全身份接口，再实施桥接。P3 游戏服务拥有角色/房间/战绩，机器人使用同一权威业务 API；博客摘要、EdgeOne/GitHub 指标是独立的只读扩展。当前这些页面明确显示待完善，没有模拟用户或运营指标。
