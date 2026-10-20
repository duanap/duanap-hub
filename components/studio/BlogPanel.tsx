'use client'

import { useEffect, useState } from 'react'

export function BlogPanel({ disabled, onBusyChange }: { disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    fetch('/api/studio/blog').then(async response => { if (!response.ok) throw new Error(); const value = await response.json(); if (active) setConfigured(Boolean(value.configured)) }).catch(() => { if (active) setMessage('无法读取来源配置，请刷新或重新登录。') })
    return () => { active = false }
  }, [])
  async function refresh() {
    if (disabled || loading) return
    setLoading(true); onBusyChange(true); setMessage('')
    try {
      const response = await fetch('/api/studio/blog', { method: 'POST' })
      if (response.status === 401) { window.location.assign('/duanap/login'); return }
      if (!response.ok) throw new Error('刷新失败，请稍后重试。')
      const result = await response.json()
      setMessage(result.status === 'ready' ? `已同步 ${result.count} 篇公开摘要。${result.truncated ? '仅保留最近500篇。' : ''}` : result.status === 'disabled' ? '请先保存“读取博客文章摘要”，并启用博客模块。' : result.status === 'unconfigured' ? '请先配置服务端 WordPress 来源。' : `博客暂时无法连接。${result.stale ? '已保留上次摘要。' : ''}请稍后重试。`)
    } catch (error) { setMessage(error instanceof Error ? error.message : '刷新失败') }
    finally { setLoading(false); onBusyChange(false) }
  }
  return <section className="home-section"><h3>博客文章摘要</h3><p className="form-hint">服务端来源：{configured === null ? '读取中…' : configured ? '已配置' : '未配置'}。首次接入需在 .env.local 设置 HUB_WORDPRESS_URL 并重启；公开列表每10分钟按访问刷新，失败保留缓存。来源只读，正文在独立博客管理。</p><button type="button" className="action-secondary" disabled={disabled || loading || !configured} onClick={() => void refresh()}>{loading ? '同步中…' : '刷新文章摘要'}</button>{message && <p role="status">{message}</p>}</section>
}
