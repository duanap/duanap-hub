export async function readLimitedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new Error('请求内容过大')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('没有请求内容')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.length
      if (length > limit) { await reader.cancel(); throw new Error('请求内容过大') }
      chunks.push(part.value)
    }
    return Buffer.concat(chunks)
  } finally { reader.releaseLock() }
}
