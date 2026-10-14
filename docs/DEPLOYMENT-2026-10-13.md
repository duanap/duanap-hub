# 2026-10-13 主域部署验收

用户要求部署到 duanap.cn / www.duanap.cn，并选择全新内容库。部署版本为 `af6a954`，原内容未导入；管理员沿用现有账号和密码。

- 主站：[duanap.cn](https://duanap.cn/)
- www：[www.duanap.cn](https://www.duanap.cn/) 跳转主域
- 后台：[Studio 登录](https://duanap.cn/duanap/login)

## 验证结果

- 生产构建与类型检查通过；部署环境的备份恢复用例 6/6、密码环境回归用例 1/1。
- 隔离验收实例完成真实管理员登录/登出、图片上传、项目编辑、canonical/slug 重定向和在线归档；数据库正文与媒体实际恢复一致，归档不包含管理员会话。
- 公网首页、登录、健康、robots、Sitemap、RSS、OG 正常，未登录管理员接口返回 401；HTTPS、HTTP 与 www 规范跳转通过。
- EdgeOne 缓存规则经用户确认修正后，公开后台/API 保持 `private, no-store`；真实 CSS 保持 `public, immutable`，连续请求验证边缘缓存从 MISS 变为 HIT。
- 真实 Edge 浏览器桌面/手机截图检查通过，390 px 视口无横向溢出；登录表单正常，页面 JavaScript 错误为 0。
- 原站点内容和可恢复版本保留，新站初始归档已创建。完整恢复步骤与配置快照仅保存在用户受控的私有位置。

## 后续

新站使用全新内容库，需在 Studio 填写实际项目、资料和公告，并定期保存内容备份。旧内容转换和历史 URL 映射需要独立审核；搜索平台实际收录尚未验证。

本公开记录不包含服务器路径、服务单元、云规则标识、配置快照、凭据或具体回滚命令。通用备份说明见 `BACKUP-RESTORE.md`。
