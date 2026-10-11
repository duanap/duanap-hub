import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { createProject, listProjects } from '@/lib/db'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    const created = createProject(await parseJson(request, 150_000))
    return NextResponse.json({ project: created, projects: listProjects() }, { status: 201 })
  } catch (e) {
    return apiError(e)
  }
}
