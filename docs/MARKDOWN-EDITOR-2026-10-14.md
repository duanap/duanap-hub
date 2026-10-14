# 项目 Markdown 可视化编辑修复

用户希望输入 Markdown 时立即看见标题、加粗等格式。原实现只有纯文本输入和单独预览，编辑框本身不会排版。夜间模式另有浅色主题固定颜色覆盖，导致标题和正文难以辨认。

## 修改范围

- 项目介绍与公告正文默认可视化编辑，支持 Markdown 输入快捷方式、纯文本/双格式剪贴板粘贴、标题/加粗/斜体/列表/引用/代码块及撤销/重做。
- 保留 Markdown 源码和草稿预览；数据库继续保存 Markdown。打开与切换模式不会自动改写原文，也不会凭空产生未保存状态。
- 可视化编辑器按需加载；不支持的 Markdown 通过语义检查保留源码，粘贴时保持选区位置和行内/块级结构。
- 预览与公开页面共用 GFM 渲染，支持表格、任务列表和删除线，保留原有默认 HTML/危险链接防护。
- 夜间模式正文、标题、强调、引用和代码为白色，代码背景跟随暗色主题；保存禁用不再降低正文透明度。没有正文遮罩，浏览器命中测试确认文字未被其他层遮挡。
- Next.js 更新到 16.3.8，Sharp 更新到 0.35.5，修复依赖检查发现的已有安全公告，当前 `npm audit` 为 0。

## 验证与限制

专项覆盖输入即排版、项目/公告真实保存与公开展示、原文保持、脚注/HTML 源码保护、三种粘贴边界、移动端保存保护、夜间文字颜色与遮挡检查。完整验证结果与服务器发布状态见 `DEVELOPMENT-STATUS.md`。

编辑器的 Markdown 转换使用固定版本，未覆盖的复杂语法继续使用源码模式；不承诺所有 Markdown 扩展都可在可视化模式编辑。参考 [Tiptap Markdown 文档](https://tiptap.dev/docs/editor/markdown) 和 [GFM 插件文档](https://github.com/remarkjs/remark-gfm)。安全更新依据 [Next.js 公告](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) 与 [Sharp 公告](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)。

用户调整为先完成本修复，再进入 P2-0；子比现有 QQ 登录将作为 P2 审计和主站身份桥接的基础。
