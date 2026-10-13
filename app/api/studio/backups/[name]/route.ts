import { hasAdminSession } from '@/lib/admin-auth'
import { downloadBackup } from '@/lib/backups'
export const runtime = 'nodejs'
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!await hasAdminSession()) return new Response('Unauthorized', { status: 401 })
  const { name } = await params, data = await downloadBackup(name)
  if (!data) return new Response('Not found', { status: 404 })
  return new Response(data, { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
