// Test-server preload: fail external fetches so Core independence is exercised.
const fetchOriginal = globalThis.fetch
globalThis.fetch = (input, options) => {
  const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url
  const target = new URL(value)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) return Promise.reject(new Error('离线演练拒绝外部请求'))
  return fetchOriginal(input, options)
}
