import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { createEntry, getProjectEntries } from '@/lib/db'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    const entry = createEntry(await parseJson(request, 80_000))
    return NextResponse.json(
      { entry, entries: getProjectEntries(entry.projectId) },
      { status: 201 },
    )
  } catch (e) {
    return apiError(e)
  }
}
