import type { ModuleDefinition, ModuleId } from '@/lib/types'

// Code registration is static. Database controls enable/order at runtime.
// Stage 2/3 services remain unavailable until their implementations are shipped.
export const REGISTERED_MODULES: readonly ModuleDefinition[] = [
  { id: 'about', name: '关于我', summary: '个人资料与社交账号', stage: 1, defaultEnabled: true, available: true },
  { id: 'projects', name: '项目与作品', summary: '独立的项目资料归档', stage: 1, defaultEnabled: false, available: true },
  { id: 'games', name: '游戏展示', summary: '独立游戏展示', stage: 1, defaultEnabled: false, available: true },
  { id: 'tools', name: '在线工具', summary: '轻量实用工具入口', stage: 1, defaultEnabled: false, available: true },
  { id: 'blog', name: '博客页面', summary: '独立原文入口与可选共享摘要列表', stage: 1, defaultEnabled: true, available: true },
  { id: 'photos', name: '影像相册', summary: '后台管理的相册、照片、封面与说明', stage: 1, defaultEnabled: true, available: true },
  { id: 'notes', name: '朋友圈文案', summary: '后台自行添加的心情与文字，标题可选', stage: 1, defaultEnabled: true, available: true },
  { id: 'links', name: '友链', summary: '后台自行添加的朋友网站', stage: 1, defaultEnabled: true, available: true },
  { id: 'content', name: '博客动态', summary: '公开文章摘要、分类与综合 RSS；独立缓存', stage: 3, defaultEnabled: false, available: true },
  { id: 'accounts', name: '统一账号', summary: '博客登录与只读账号中心；需服务器配置', stage: 2, defaultEnabled: false, available: true },
  { id: 'edgeone', name: 'EdgeOne 数据', summary: '只读请求、流量、缓存与 Web 防护汇总；独立缓存', stage: 3, defaultEnabled: false, available: true },
  { id:'github',name:'GitHub 动态',summary:'公开仓库更新与版本标签；不覆盖项目正式版本',stage:3,defaultEnabled:false,available:true }
]
export function isModuleId(v: string): v is ModuleId {
  return REGISTERED_MODULES.some(m => m.id === v)
}
