import { Readable } from 'node:stream'
import { openMedia } from '@/lib/media'
export const runtime = 'nodejs'
type Context = { params: Promise<{ name: string }> }

async function serve(request: Request, { params }: Context) {
  const media = await openMedia((await params).name)
  if (!media) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const headers = new Headers({ 'Content-Type': media.mime, 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'" })
  let start = 0, end = media.size - 1, status = 200
  const range = request.method === 'HEAD' ? null : request.headers.get('range')
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match && (match[1] || match[2])) {
      if (!match[1]) { const length = Number(match[2]); start = length > 0 ? Math.max(0, media.size - length) : media.size }
      else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end) }
    } else start = media.size
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= media.size || end < start) {
      await media.handle.close(); headers.set('Content-Range', 'bytes */' + media.size); headers.set('Cache-Control', 'no-store')
      return new Response(null, { status: 416, headers })
    }
    status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${media.size}`)
  }
  headers.set('Content-Length', String(end - start + 1))
  if (request.method === 'HEAD') { await media.handle.close(); return new Response(null, { headers }) }
  const stream = media.handle.createReadStream({ start, end, autoClose: true })
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers })
}
export const GET = serve
export const HEAD = serve
