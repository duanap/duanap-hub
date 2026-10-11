import { getDatabase, isEnabled } from '@/lib/db'
import type { IconName } from '@/components/Icon'
export const TOOLS = [
  {
    id: 'markdown',
    title: 'Markdown 转换',
    summary: '安全预览，导出 HTML 或纯文本。',
    group: '文档转换',
    icon: 'book' as IconName,
    color: 'blue',
  },
  {
    id: 'json',
    title: 'JSON 格式化',
    summary: '美化、压缩与校验，让数据更清晰。',
    group: '开发工具',
    icon: 'code' as IconName,
    color: 'purple',
  },
  {
    id: 'ip',
    title: 'IP 本地检查',
    summary: '检查 IPv4/IPv6 格式和常见地址类型。',
    group: '网络工具',
    icon: 'grid' as IconName,
    color: 'blue',
  },
  {
    id: 'password',
    title: '安全密码生成',
    summary: '安全随机数，自定义字符和长度。',
    group: '安全工具',
    icon: 'lock' as IconName,
    color: 'amber',
  },
  {
    id: 'timestamp',
    title: '时间戳转换',
    summary: 'Unix 秒/毫秒与北京时间转换。',
    group: '开发工具',
    icon: 'clock' as IconName,
    color: 'green',
  },
  {
    id: 'base64',
    title: 'Base64 工具',
    summary: 'UTF-8 文本编码、解码，支持中文与 Emoji。',
    group: '开发工具',
    icon: 'code' as IconName,
    color: 'pink',
  },
] as const
export type ToolId = (typeof TOOLS)[number]['id']
export type ToolState = {
  id: ToolId
  title: string
  summary: string
  group: string
  icon: IconName
  color: string
  enabled: boolean
}
export function listTools(): ToolState[] {
  const rows = getDatabase().prepare('SELECT * FROM tool_settings').all() as {
    id: string
    title: string
    summary: string
    enabled: number
  }[]
  return TOOLS.map((t) => {
    const row = rows.find((r) => r.id === t.id)
    return {
      ...t,
      ...(row
        ? { title: row.title, summary: row.summary, enabled: !!row.enabled }
        : { enabled: true }),
    }
  })
}
export function publicTools() {
  return isEnabled('tools') ? listTools().filter((t) => t.enabled) : []
}
export function updateTool(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('工具设置无效')
  const p = payload as Record<string, unknown>
  if (Object.keys(p).some((k) => !['id', 'enabled', 'title', 'summary'].includes(k)))
    throw new Error('工具字段无效')
  const old = listTools().find((t) => t.id === p.id)
  if (!old) throw new Error('未知工具')
  if (p.enabled !== undefined && typeof p.enabled !== 'boolean') throw new Error('开关类型无效')
  for (const k of ['title', 'summary'])
    if (
      p[k] !== undefined &&
      (typeof p[k] !== 'string' ||
        !String(p[k]).trim() ||
        String(p[k]).length > (k === 'title' ? 80 : 500))
    )
      throw new Error('工具文案无效')
  const t = { ...old, ...p } as ToolState
  getDatabase()
    .prepare(
      'INSERT INTO tool_settings(id,enabled,title,summary) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,title=excluded.title,summary=excluded.summary',
    )
    .run(t.id, t.enabled ? 1 : 0, t.title.trim(), t.summary.trim())
  return listTools()
}
