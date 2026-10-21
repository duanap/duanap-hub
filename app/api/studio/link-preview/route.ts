import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { inspectWebsite } from '@/lib/site-preview'
export const runtime = 'nodejs'
let pending = 0
export async function POST(request: Request) {
  const denied = await guardAdminMutation(request); if (denied) return denied
  if (pending >= 2) return NextResponse.json({ error: '正在获取网站信息，请稍后再试' }, { status: 429 })
  pending++
  try {
    const data = await parseJson(request, 2000) as Record<string, unknown>
    if (!data || typeof data.url !== 'string' || Object.keys(data).some(key => key !== 'url')) throw Error('请填写网站地址')
    return NextResponse.json(await inspectWebsite(data.url), { headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) { return apiError(cause) }
  finally { pending-- }
}
