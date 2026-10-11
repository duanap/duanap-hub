import type { ModuleDefinition, ModuleId } from '@/lib/types'

// Code registration is static. Database controls enable/order at runtime.
// Stage 2/3 services remain unavailable until their implementations are shipped.
export const REGISTERED_MODULES: readonly ModuleDefinition[] = [
  {
    id: 'about',
    name: '关于我',
    summary: '个人资料与社交账号',
    stage: 1,
    defaultEnabled: true,
    available: true,
  },
  {
    id: 'projects',
    name: '项目与作品',
    summary: '项目、版本和公告',
    stage: 1,
    defaultEnabled: true,
    available: true,
  },
  {
    id: 'games',
    name: '游戏展示',
    summary: '项目中的游戏分类',
    stage: 1,
    defaultEnabled: true,
    available: true,
  },
  {
    id: 'tools',
    name: '在线工具',
    summary: '轻量实用工具入口',
    stage: 1,
    defaultEnabled: true,
    available: true,
  },
  {
    id: 'updates',
    name: '最近动态',
    summary: '项目发布日志和公告',
    stage: 1,
    defaultEnabled: true,
    available: true,
  },
  {
    id: 'content',
    name: '博客动态',
    summary: 'P3：WordPress 文章摘要',
    stage: 3,
    defaultEnabled: false,
    available: false,
  },
  {
    id: 'accounts',
    name: '统一账号',
    summary: 'P2：WordPress 用户与积分',
    stage: 2,
    defaultEnabled: false,
    available: false,
  },
  {
    id: 'edgeone',
    name: 'EdgeOne 数据',
    summary: 'P3：流量/缓存/安全数据',
    stage: 3,
    defaultEnabled: false,
    available: false,
  },
]
export function isModuleId(v: string): v is ModuleId {
  return REGISTERED_MODULES.some((m) => m.id === v)
}
