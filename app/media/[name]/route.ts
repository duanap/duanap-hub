import { readMedia } from '@/lib/media'
export const runtime = 'nodejs'
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const data = await readMedia((await params).name)
  if (!data) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return new Response(data, { headers: {
    'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'",
  } })
}
