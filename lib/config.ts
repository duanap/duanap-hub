import type { HubSettings } from '@/lib/types'
import { DEFAULT_HOME_WIDGETS, HOME_WIDGETS } from '@/lib/home-config'

export const SITE_URL = new URL(process.env.HUB_SITE_URL || 'http://127.0.0.1:1026')
export const SITE_ORIGIN = SITE_URL.origin
export const SITE_BASE = `${SITE_ORIGIN}/`

export const DEFAULT_SETTINGS: HubSettings = {
  siteName: 'duanap的小破站',
  displayName: 'duanap',
  tagline: '写代码，做些有趣的东西。',
  biography: '这里是 duanap 的个人网站，记录云计算、Vibe Coding、开发实践与个人作品。',
  publicEmail: 'mail@duanap.cn',
  githubUrl: 'https://github.com/duanap',
  blogUrl: '',
  avatarUrl: '',
  seoTitle: 'duanap的小破站 - 个人开发者与作品展示',
  seoDescription: 'duanap 的个人网站：Vibe Coding、云计算、开源作品、小游戏与技术分享。',
  seoIndexable: true,
  icpNumber: '',
  icpUrl: 'https://beian.miit.gov.cn/',
  policeNumber: '',
  policeUrl: '',
  copyright: 'duanap',
  homeProjectsLimit: 6,
  homeShowUpdates: true,
  homeLayout: 'cards',
  homeWidgets: DEFAULT_HOME_WIDGETS,
  homeQuote: '',
  homeConsole: '',
  homeReadingText: '',
  homeReadingUrl: '',
  homeGreeting: 'Hi, I’m',
  homeTags: [],
  homeGardenText: '慢慢生长。',
  homeQuoteAuthor: '',
  homeReadingLabel: '在读',
  homePhotosSource: 'albums',
  homePhotoUrls: [],
  publicIcons: {},
  musicPlaylist: [],
  blogSyncEnabled: false,
  socialLinks: [],
  passwordToolTitle: '安全密码生成器',
  passwordToolDescription: '自定义字符集和长度，在浏览器本地生成随机密码，不上传或保存。'
}

const MAX_LENGTHS: Record<Exclude<keyof HubSettings, 'seoIndexable' | 'homeProjectsLimit' | 'homeShowUpdates' | 'socialLinks' | 'homeWidgets' | 'musicPlaylist' | 'blogSyncEnabled' | 'homeTags' | 'homePhotoUrls' | 'publicIcons'>, number> = {
  siteName: 80,
  displayName: 50,
  tagline: 160,
  biography: 4000,
  publicEmail: 255,
  githubUrl: 500,
  blogUrl: 500,
  avatarUrl: 500,
  seoTitle: 120,
  seoDescription: 500,
  icpNumber: 80,
  icpUrl: 500,
  policeNumber: 80,
  policeUrl: 500,
  copyright: 100,
  homeLayout: 20,
  homeQuote: 300,
  homeConsole: 1000,
  homeReadingText: 200,
  homeReadingUrl: 500,
  homeGreeting: 80,
  homeGardenText: 80,
  homeQuoteAuthor: 80,
  homeReadingLabel: 80,
  homePhotosSource: 10,
  passwordToolTitle: 100,
  passwordToolDescription: 500,
}

const URL_FIELDS: (keyof HubSettings)[] = ['githubUrl', 'avatarUrl', 'icpUrl', 'policeUrl']
function allowedUrl(value: string) {
  if (!value) return true
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try { return ['https:', 'http:'].includes(new URL(value).protocol) }
  catch { return false }
}

export function publicHttpUrl(value: string) {
  if (!/^https?:\/\//.test(value) || /[\\\x00-\x20]/.test(value)) return false
  try { const url = new URL(value); return !url.username && !url.password && ['http:', 'https:'].includes(url.protocol) } catch { return false }
}
export function publicImageUrl(value: string) {
  return !value || (value.length <= 500 && (publicHttpUrl(value) || /^\/media\/[a-f0-9-]{36}\.webp$/.test(value)))
}

export function validateSettingsPatch(value: unknown): Partial<HubSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的网站设置')
  const record = value as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(record)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error(`不支持的设置：${key}`)
    if (key === 'homeTags') {
      if (!Array.isArray(raw) || raw.length > 30 || raw.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 40)) throw new Error('兴趣标签最多30个，每个最多40字')
      patch[key] = [...new Set(raw.map(tag => tag.trim()))]; continue
    }
    if (key === 'homePhotoUrls') {
      if (!Array.isArray(raw) || raw.length > 24 || raw.some(url => typeof url !== 'string' || !url || !publicImageUrl(url))) throw new Error('首页图片最多24张，请选择媒体图片或 HTTP(S) 地址')
      patch[key] = [...new Set(raw)]; continue
    }
    if (key === 'publicIcons') {
      const allowed = ['logo', 'blog', 'photos', 'notes', 'links', 'about', 'code', 'mail', 'music', 'rss']
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.entries(raw).some(([id, url]) => !allowed.includes(id) || typeof url !== 'string' || !publicImageUrl(url))) throw new Error('图标须为已上传图片或 HTTP(S) 图片地址')
      patch[key] = { ...raw }; continue
    }
    if (key === 'homeWidgets') {
      if (!Array.isArray(raw) || raw.length !== HOME_WIDGETS.length || new Set(raw.map(item => item?.id)).size !== HOME_WIDGETS.length || raw.some(item => !item || typeof item !== 'object' || Object.keys(item).some(key => !['id', 'enabled', 'width'].includes(key)) || !HOME_WIDGETS.some(widget => widget.id === item.id) || typeof item.enabled !== 'boolean' || !['auto', 'small', 'wide', 'full'].includes(item.width))) throw new Error('首页卡片配置须包含全部卡片且不可重复，宽度和启停须有效')
      patch[key] = raw.map(item => ({ id: item.id, enabled: item.enabled, width: item.width })); continue
    }
    if (key === 'musicPlaylist') {
      if (!Array.isArray(raw) || raw.length > 200 || raw.some(item => !item || typeof item !== 'object' || Object.keys(item).some(key => !['title', 'artist', 'url', 'coverUrl', 'enabled'].includes(key)) || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120 || typeof item.artist !== 'string' || item.artist.length > 120 || typeof item.url !== 'string' || item.url.length > 1000 || !publicHttpUrl(item.url) || typeof item.coverUrl !== 'string' || !publicImageUrl(item.coverUrl) || (item.enabled !== undefined && typeof item.enabled !== 'boolean'))) throw new Error('歌曲库最多200首，每首须填写名称和 HTTP(S) 音频直链，封面须为有效图片地址')
      patch[key] = raw.map(item => ({ title: item.title.trim(), artist: item.artist.trim(), url: item.url, coverUrl: item.coverUrl, enabled: item.enabled !== false })); continue
    }
    if (key === 'homeProjectsLimit') {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 24) throw new Error('首页项目数须为 1 到 24')
      patch[key] = raw; continue
    }
    if (key === 'socialLinks') {
      if (!Array.isArray(raw) || raw.length > 12 || raw.some(link => !link || typeof link !== 'object' || typeof link.label !== 'string' || !link.label.trim() || link.label.length > 40 || typeof link.url !== 'string' || link.url.length > 500 || !/^https?:\/\//.test(link.url) || /[\\\x00-\x20]/.test(link.url) || !allowedUrl(link.url))) throw new Error('社交入口须填写名称与有效 HTTP(S) 地址，最多 12 个')
      if (raw.some(link => Object.keys(link).some(key => !['label', 'url', 'iconUrl'].includes(key)) || (link.iconUrl !== undefined && (typeof link.iconUrl !== 'string' || !publicImageUrl(link.iconUrl))))) throw new Error('社交图标须为已上传图片或 HTTP(S) 图片地址')
      patch[key] = raw.map(link => ({ label: link.label.trim(), url: link.url.trim(), iconUrl: link.iconUrl || '' })); continue
    }
    if (key === 'seoIndexable' || key === 'homeShowUpdates' || key === 'blogSyncEnabled') {
      if (typeof raw !== 'boolean') throw new Error(`${key} 必须为布尔值`)
      patch[key] = raw
      continue
    }
    const name = key as keyof typeof MAX_LENGTHS
    if (typeof raw !== 'string' || raw.length > MAX_LENGTHS[name]) throw new Error(`${key} 内容长度或类型无效`)
    const val = raw.trim()
    if (key === 'homePhotosSource' && !['albums', 'custom'].includes(val)) throw new Error('请选择相册或自定义首页图片')
    if (key === 'homeReadingUrl' && val && !publicHttpUrl(val) && !/^\/(?!\/)[a-zA-Z0-9\-_/]*$/.test(val)) throw new Error('记录链接须为 HTTP(S) 或站内路径')
    if (key === 'blogUrl' && val && !publicHttpUrl(val)) throw new Error('博客地址必须是完整 HTTP(S) 地址')
    if (['siteName','displayName','seoTitle','passwordToolTitle'].includes(key) && !val) throw new Error('网站名称、昵称、搜索标题和工具名称不能为空')
    if (key === 'homeLayout' && !['cards','compact'].includes(val)) throw new Error('首页布局无效')
    if (URL_FIELDS.includes(name) && !allowedUrl(val)) throw new Error(`${key} 必须是 HTTP(S) 或站内路径`)
    patch[key] = val
  }
  return patch as Partial<HubSettings>
}
