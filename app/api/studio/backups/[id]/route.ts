import { NextResponse } from 'next/server'
import { hasAdminSession } from '@/lib/admin-auth'
import { exportBackup } from '@/lib/backups'
import { apiError } from '@/lib/api'
export const runtime = 'nodejs'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasAdminSession()))
    return NextResponse.json({ error: '未登录管理员' }, { status: 401 })
  try {
    const { id } = await params
    return NextResponse.json(await exportBackup(id), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="hub-backup-' + id + '.json"',
      },
    })
  } catch (e) {
    return apiError(e)
  }
}
