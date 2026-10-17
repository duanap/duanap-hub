# P3 第二批：工具、Widget 与 GitHub

本批完成不依赖新增账号授权的工具与公开数据卡片。EdgeOne/搜索平台凭据、游戏和机器人身份不在本次范围；P2 本人真实同 QQ 自动关联及双站签到仍单独验收。

## 工具与隐私

- `/tools/convert`：Markdown → 纯文本、HTML、Word（DOCX），HTML/DOCX → Markdown；使用浏览器 Worker，不上传文件或记录转换历史。HTML 由非 DOM 解析器处理，不将输入/结果注入页面；链接协议限制，脚本/iframe/表单删除，图片只保留说明，不下载远程图像。导出的 HTML 另有禁止脚本/资源/表单的 CSP。
- 支持 `.docx`，不支持旧 `.doc`、宏或加密文档；基础标题、强调、列表、表格可转换，复杂排版需下载复核。文本最多 20 万字，DOCX 最多 5 MiB，最多 1000 个压缩条目、10 MiB 单文件、20 MiB 实际展开总量；Worker 最长 15 秒，可取消。Mammoth 显式禁用外部文件与嵌入样式；Worker 禁止 fetch。
- `/tools/ip`：用户先同意，再从浏览器直接访问 [IPQuery](https://ipquery.io/)；支持当前出口或指定公网 IPv4/IPv6。主站没有 IP 转发接口，不接收待查询地址；不转发 Cookie 或登录凭据，不保存查询记录。保留/内网/回环地址不发送；请求 5 秒和 16 KB 上限，显示第三方估算归属地与 ISP，不宣称精确位置。第三方失败清除结果，不假报数值。
- Studio“工具配置”管理每个工具的启停、标题、说明、帮助与独立 SEO；工具关闭同时影响首页、工具目录、独立页面与 Sitemap。原密码生成器仍可用；旧站点密码工具字段仅作为未配置时的兼容默认值，不扩展旧设置 JSON。

文档实现使用 [docx](https://github.com/dolanmiu/docx)、[Mammoth](https://github.com/mwilliamson/mammoth.js)、unified 系列与 fflate。依赖已精确锁定；现有依赖版本均未改变。发现实体解码器默认 browser 条件依赖 document，已对 Turbopack/Webpack 都选择包自带的纯 JavaScript 实现，避免 Worker 访问 DOM；Worker 就绪握手避免初始化期间丢请求。

## Widget 与公开仓库

现有模块启停/排序继续使用 module_settings；新 module_layout 独立保存首页区域小/中/大尺寸，默认大区域保持原布局，移动端均单列。博客自身文章卡片尺寸与整个首页区域尺寸分别设置；本地模块继续人工维护，外部卡片明确数据来源、成功时间、加载/未配置/过期/失败状态。新增导航导致短桌面高度下退出按钮超出视口的问题已通过侧栏导航独立滚动修复。

GitHub 模块默认注册关闭，Studio 可填写最多 4 个公开 `owner/repo`，不接收任意网址或 Token。只匿名读固定 `api.github.com` 的仓库、最近 3 个标签及最近 1 个 Release；校验 public 标识、仓库名与 GitHub 链接，丢弃额外字段。仓库标签不覆盖本地项目的人工正式版本。

GitHub 首页 SSR 只读本地缓存，客户端按需同步；缓存 30 分钟，失败退避 5 分钟并保留成功值，空缓存不显示虚构的零。同步共享 3.5 秒、单响应 128 KB、禁止重定向、不转发身份信息；并发合并，配置/模块代次变化阻止旧结果写回。GitHub 匿名限额会独立影响卡片，不影响 Core、博客或 Studio。

## 数据、验证与发布

新增 module_layout、tool_settings、github_settings、github_cache 独立表，库版本保持 1；旧发布忽略新表与 github 模块记录。内容备份包含配置与公开仓库缓存，身份库仍独立。部署保留现有管理员、会员、博客映射/积分与媒体，Bridge 无需改动；回退切换旧代码/恢复原 github 模块开关，不恢复旧会员库或博客账本。

检查包括：新 P3 浏览器/API 11 项、博客 9 项、离线 Core 43 项（2 条 QQ 条件跳过）、旧账号协议 34 项（1 条关闭写入条件跳过）、备份 8 项、管理员环境 1 项，以及构建/类型/结构检查。覆盖真实 DOCX 下载并检查 OOXML、DOCX 读入、压缩体积超限、恶意 HTML 零外部请求、取消、IP 同意/保留地址/错误清理、逐工具 SEO/启停、GitHub 失败/私有数据/限流/尺寸/重定向/并发代次、慢请求不影响 Core、Studio 未保存及备份。

服务器依赖通过精确 lockfile 的 npm ci、禁用安装脚本并限制 CPU/内存安装；Node/Next/React/Sharp/better-sqlite3 版本保持原值。仅复用同机同版本/ABI 的已验证 SQLite native binary。先在隔离数据的临时实例验证 Webpack Worker 与转换，再切换生产。正式发布结果完成后追加。
