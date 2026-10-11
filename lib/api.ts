import { NextResponse } from 'next/server'
export async function readBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const length = request.headers.get('content-length')
  if (length && Number(length) > maxBytes) throw new Error('请求内容过大')
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new Error('请求内容过大')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.length
  }
  return bytes
}
export async function parseJson(request: Request, maxBytes = 50_000): Promise<unknown> {
  const bytes = await readBytes(request, maxBytes)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new Error('请求 JSON 格式无效')
  }
}
export function apiError(error: unknown, code = 400) {
  const message = error instanceof Error ? error.message : '操作失败'
  const internal = /SQLITE|ENOENT|EPERM|EACCES|better-sqlite|binding|[A-Z]:\\|\/srv\/|sharp/i.test(
    message,
  )
  return NextResponse.json(
    { error: internal ? '操作失败，请检查服务器日志或稍后重试' : message },
    { status: code, headers: { 'Cache-Control': 'no-store' } },
  )
}
