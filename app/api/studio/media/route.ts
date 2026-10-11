import { NextResponse } from 'next/server'
import { guardAdminMutation, hasAdminSession } from '@/lib/admin-auth'
import { apiError, readBytes } from '@/lib/api'
import { listMedia, saveMedia } from '@/lib/media'
export const runtime = 'nodejs'
export async function GET() {
  if (!(await hasAdminSession()))
    return NextResponse.json({ error: '未登录管理员' }, { status: 401 })
  return NextResponse.json({ media: listMedia() }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    const bytes = await readBytes(request, 5 * 1024 * 1024 + 64 * 1024),
      form = await new Response(bytes, {
        headers: { 'Content-Type': request.headers.get('content-type') || '' },
      }).formData(),
      file = form.get('file')
    if (!(file instanceof File)) throw new Error('请选择图片')
    return NextResponse.json({ item: await saveMedia(file), media: listMedia() })
  } catch (e) {
    return apiError(e)
  }
}
