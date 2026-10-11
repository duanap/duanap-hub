import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getDatabase } from '@/lib/db'
import { dataDirectory } from '@/lib/storage'
export const runtime = 'nodejs'
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  if (!/^[a-f0-9-]{36}\.webp$/.test(filename)) return new Response(null, { status: 404 })
  const found = getDatabase().prepare('SELECT 1 FROM media WHERE filename=?').get(filename)
  if (!found) return new Response(null, { status: 404 })
  try {
    const bytes = await readFile(path.join(dataDirectory(), 'media', filename))
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public,max-age=31536000,immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}
