import type { ModuleDefinition, ModuleId } from '@/lib/types'

// Code registration is static. Database controls enable/order at runtime.
// Stage 2/3 services remain unavailable until their implementations are shipped.
export const REGISTERED_MODULES: readonly ModuleDefinition[] = [
  { id: 'about', name: '关于我', summary: '个人资料与社交账号', stage: 1, defaultEnabled: true, available: true },
  { id: 'projects', name: '项目与作品', summary: '项目、版本和公告', stage: 1, defaultEnabled: true, available: true },
  { id: 'games', name: '游戏展示', summary: '项目中的游戏分类', stage: 1, defaultEnabled: true, available: true },
  { id: 'tools', name: '在线工具', summary: '轻量实用工具入口', stage: 1, defaultEnabled: true, available: true },
  { id: 'blog', name: '博客页面', summary: '独立原文入口与可选共享摘要列表', stage: 1, defaultEnabled: true, available: true },
  { id: 'photos', name: '影像相册', summary: '独立相册与已发布项目图片', stage: 1, defaultEnabled: true, available: true },
  { id: 'notes', name: '随记与动态', summary: '个人随记与已生效的项目更新', stage: 1, defaultEnabled: true, available: true },
  { id: 'links', name: '友链与公开链接', summary: '友链、社交账号与已发布项目入口', stage: 1, defaultEnabled: true, available: true },
  { id: 'content', name: '博客动态', summary: '公开文章摘要、分类与综合 RSS；独立缓存', stage: 3, defaultEnabled: false, available: true },
  { id: 'accounts', name: '统一账号', summary: '博客登录与只读账号中心；需服务器配置', stage: 2, defaultEnabled: false, available: true },
  { id: 'edgeone', name: 'EdgeOne 数据', summary: '只读请求、流量、缓存与 Web 防护汇总；独立缓存', stage: 3, defaultEnabled: false, available: true },
  { id:'github',name:'GitHub 动态',summary:'公开仓库更新与版本标签；不覆盖项目正式版本',stage:3,defaultEnabled:false,available:true }
]
export function isModuleId(v: string): v is ModuleId {
  return REGISTERED_MODULES.some(m => m.id === v)
}
