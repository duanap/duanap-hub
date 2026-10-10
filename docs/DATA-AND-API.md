# 数据模型与 API 边界

## P1 主站 SQLite

| 表 | 职责 |
| --- | --- |
| `site_settings` | 全站资料、SEO、备案等 JSON 配置（当前 starter 的最小模式） |
| `module_settings` | 已注册模块的启停和位置 |
| `projects` | 公开项目、游戏分类、手动状态、版本、slug 和 SEO |
| `project_entries` | 更新日志、更新预告、维护公告、路线图等内容记录 |
| `admin_sessions` | 独立 Studio 管理员的短期会话 hash |
| `admin_login_attempts` | 登录失败限速 |

`published` 控制对外可见；`status` 只是手动运营状态。未发布项目不得列入公开列表或 Sitemap。内容日志同样区分草稿与已发布，RSS 只收已发布动态。

数据库路径 `HUB_DATA_DIR/hub.sqlite`，默认开发 `./data/hub.sqlite`。启用 WAL 与外键；备份须使用 SQLite 安全备份方式并覆盖必要媒体目录。

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

## P1 开发骨架 API

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
| GET | `/api/health` | 最小健康检查，不泄漏机密 |

写 API 必须完成管理员认证、CSRF Origin 验证、输入校验；公网访问须 HTTPS。
