import { NextResponse } from 'next/server'
import { guardAdminMutation, hasAdminSession } from '@/lib/admin-auth'
import { createBackup, listBackups } from '@/lib/backups'
import { apiError } from '@/lib/api'
export const runtime = 'nodejs'
export async function GET() {
  if (!(await hasAdminSession()))
    return NextResponse.json({ error: '未登录管理员' }, { status: 401 })
  return NextResponse.json(
    { backups: await listBackups() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
export async function POST(request: Request) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    const { directory, ...item } = await createBackup()
    return NextResponse.json({ item, backups: await listBackups() })
  } catch (e) {
    return apiError(e)
  }
}
