import { NextResponse } from 'next/server'
import { hasAdminSession, guardAdminMutation } from '@/lib/admin-auth'
import { listBackups, createBackup } from '@/lib/backups'
export const runtime = 'nodejs'
export async function GET() {
  if (!await hasAdminSession()) return NextResponse.json({ error: '未登录管理员' }, { status: 401 })
  return NextResponse.json({ backups: await listBackups() }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(request: Request) {
  const deny = await guardAdminMutation(request); if (deny) return deny
  try { return NextResponse.json({ backup: await createBackup() }, { status: 201, headers: { 'Cache-Control': 'no-store' } }) }
  catch (cause) {
    console.error('[hub backup]', cause instanceof Error ? cause.message : 'unknown error')
    return NextResponse.json({ error: '备份失败，请检查可用磁盘空间和数据目录；内容上限为 128 MiB' }, { status: 500 })
  }
}
