export async function studioApi<T>(url: string, method = 'GET', payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: payload !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({ error: '服务器返回了无效响应' }))
  if (response.status === 401) {
    window.location.assign('/duanap/login')
    throw new Error('管理员会话已过期')
  }
  if (!response.ok) throw new Error(data.error || '操作失败')
  return data
}
