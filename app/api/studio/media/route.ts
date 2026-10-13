import { NextResponse } from 'next/server'
import { guardAdminMutation, hasAdminSession } from '@/lib/admin-auth'
import { listMedia, uploadImage, MAX_IMAGE_BYTES } from '@/lib/media'
import { readLimitedBody } from '@/lib/request-body'

export const runtime = 'nodejs'
export async function GET() {
  if (!await hasAdminSession()) return NextResponse.json({ error: '未登录管理员' }, { status: 401 })
  return NextResponse.json({ media: await listMedia() }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    const body = await readLimitedBody(request, MAX_IMAGE_BYTES + 64 * 1024)
    const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new Error('请选择图片文件')
    return NextResponse.json({ media: await uploadImage(file) }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: '上传失败：请使用不超过 5 MiB 的有效 PNG、JPEG、WebP 或 GIF 图片' }, { status: 400 })
  }
}
