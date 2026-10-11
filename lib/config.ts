import type { HubSettings } from '@/lib/types'

export const SITE_URL = new URL(process.env.HUB_SITE_URL || 'http://127.0.0.1:1026')
export const SITE_ORIGIN = SITE_URL.origin
export const SITE_BASE = `${SITE_ORIGIN}/`

export const DEFAULT_SETTINGS: HubSettings = {
  siteName: 'duanap · Little Space',
  displayName: 'duanap',
  tagline: '你好，我是 duanap。喜欢写代码，也喜欢把有趣的想法变成真正能体验的东西。',
  biography: '这里是 duanap 的个人网站，记录云计算、Vibe Coding、开发实践与个人作品。',
  publicEmail: 'mail@duanap.cn',
  githubUrl: 'https://github.com/duanap',
  avatarUrl: '',
  seoTitle: 'duanap的小破站 - 个人开发者与作品展示',
  seoDescription: 'duanap 的个人网站：Vibe Coding、云计算、开源作品、小游戏与技术分享。',
  seoIndexable: true,
  icpNumber: '滇ICP备2023002747号-3',
  icpUrl: 'https://beian.miit.gov.cn/',
  policeNumber: '滇公网安备53050202000823号',
  policeUrl: 'http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=53050202000823',
  copyright: 'duanap · Keep building little things.',
  heroTitle: '把好奇心，',
  heroAccent: '写成作品。',
  blogUrl: 'https://blog.duanap.cn',
  skills: '云计算，云安全，Vibe Coding，独立开发',
  experience: '',
  defaultTheme: 'light',
}

const MAX_LENGTHS: Record<Exclude<keyof HubSettings, 'seoIndexable'>, number> = {
  heroTitle: 80,
  heroAccent: 80,
  blogUrl: 500,
  skills: 1000,
  experience: 4000,
  defaultTheme: 10,
  siteName: 80,
  displayName: 50,
  tagline: 160,
  biography: 4000,
  publicEmail: 255,
  githubUrl: 500,
  avatarUrl: 500,
  seoTitle: 120,
  seoDescription: 500,
  icpNumber: 80,
  icpUrl: 500,
  policeNumber: 80,
  policeUrl: 500,
  copyright: 100,
}

const URL_FIELDS: (keyof HubSettings)[] = [
  'githubUrl',
  'avatarUrl',
  'icpUrl',
  'policeUrl',
  'blogUrl',
]
export function allowedUrl(value: string) {
  if (!value) return true
  if (/[\\\u0000-\u0020]/.test(value)) return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export function validateSettingsPatch(value: unknown): Partial<HubSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的网站设置')
  const record = value as Record<string, unknown>
  const patch: Record<string, string | boolean> = {}
  for (const [key, raw] of Object.entries(record)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error(`不支持的设置：${key}`)
    if (key === 'seoIndexable') {
      if (typeof raw !== 'boolean') throw new Error('seoIndexable 必须为布尔值')
      patch[key] = raw
      continue
    }
    const name = key as keyof typeof MAX_LENGTHS
    if (typeof raw !== 'string' || raw.length > MAX_LENGTHS[name])
      throw new Error(`${key} 内容长度或类型无效`)
    const val = raw.trim()
    if (key === 'defaultTheme' && !['light', 'dark', 'system'].includes(val))
      throw new Error('主题无效')
    if (key === 'publicEmail' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val))
      throw new Error('邮箱格式无效')
    if (URL_FIELDS.includes(name) && !allowedUrl(val))
      throw new Error(`${key} 必须是 HTTP(S) 或站内路径`)
    patch[key] = val
  }
  return patch as Partial<HubSettings>
}
