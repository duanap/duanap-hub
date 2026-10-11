import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { deleteEntry, getEntryById, getProjectEntries, updateEntry } from '@/lib/db'
export const runtime = 'nodejs'
type Params = { params: Promise<{ id: string }> }
const entryId = (s: string) => {
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('公告 ID 无效')
  return n
}
export async function PATCH(request: Request, context: Params) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    const entry = updateEntry(entryId((await context.params).id), await parseJson(request, 80_000))
    return NextResponse.json({ entry, entries: getProjectEntries(entry.projectId) })
  } catch (e) {
    return apiError(e)
  }
}
export async function DELETE(request: Request, context: Params) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    const id = entryId((await context.params).id)
    const old = getEntryById(id)
    if (!old) throw new Error('公告不存在')
    deleteEntry(id)
    return NextResponse.json({ ok: true, entries: getProjectEntries(old.projectId) })
  } catch (e) {
    return apiError(e)
  }
}
