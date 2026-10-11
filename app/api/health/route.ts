import { getDatabase } from '@/lib/db'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET() {
  try {
    getDatabase().prepare('SELECT 1').get()
    return Response.json(
      { ok: true, app: 'duanap-hub', version: '0.1.0', phase: 'P1' },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { ok: false, app: 'duanap-hub' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
