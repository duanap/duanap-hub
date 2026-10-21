import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { contentId, contentKind, deleteContent, listContent, updateContent } from '@/lib/managed-content'
import { withDataLock } from '@/lib/storage'

export const runtime = 'nodejs'
type Context = { params: Promise<{ kind: string; id: string }> }
export async function PATCH(request: Request, { params }: Context) {
  const deny = await guardAdminMutation(request); if (deny) return deny
  try {
    const values = await params, kind = contentKind(values.kind), id = contentId(values.id), payload = await parseJson(request, 200_000)
    return await withDataLock(async () => NextResponse.json({ item: updateContent(kind, id, payload), items: listContent(kind) }))
  } catch (error) { return apiError(error) }
}
export async function DELETE(request: Request, { params }: Context) {
  const deny = await guardAdminMutation(request); if (deny) return deny
  try {
    const values = await params, kind = contentKind(values.kind), id = contentId(values.id)
    return await withDataLock(async () => { deleteContent(kind, id); return NextResponse.json({ items: listContent(kind) }) })
  } catch (error) { return apiError(error) }
}
