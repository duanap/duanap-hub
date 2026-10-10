import { NextResponse } from 'next/server'

export async function parseJson(request: Request, maxBytes = 50_000): Promise<unknown> {
  const text = await request.text()
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('请求内容过大')
  try { return JSON.parse(text) }
  catch { throw new Error('请求 JSON 格式无效') }
}
export function apiError(error: unknown, code = 400) {
  const message = error instanceof Error ? error.message : '操作失败'
  // Detailed validation messages are safe only after the caller passed admin guard.
  return NextResponse.json({ error: message }, { status: code })
}
