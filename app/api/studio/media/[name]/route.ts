import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { deleteMedia } from '@/lib/media'

export async function DELETE(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    const removed = await deleteMedia((await params).name)
    if (!removed) return NextResponse.json({ error: '该图片仍被站点或项目引用，请先移除引用' }, { status: 409 })
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: '文件不存在或无法删除' }, { status: 400 }) }
}
