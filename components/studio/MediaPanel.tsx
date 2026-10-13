'use client'
import { useEffect, useState } from 'react'
import type { MediaItem } from '@/lib/media'

export function MediaPanel() {
  const [items, setItems] = useState<MediaItem[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function load() {
    try {
      const response = await fetch('/api/studio/media', { cache: 'no-store' }), data = await response.json()
      if (!response.ok) throw new Error(data.error || '读取失败')
      setItems(data.media)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取失败') }
  }
  useEffect(() => { void load() }, [])
  async function remove(item: MediaItem) {
    if (busy || !window.confirm('删除这张图片？已被内容引用的图片会保留。')) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/studio/media/' + item.name, { method: 'DELETE' }), data = await response.json()
      if (!response.ok) throw new Error(data.error || '删除失败')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败') }
    finally { setBusy(false) }
  }
  return <section className="studio-card"><div className="card-heading"><div><h2>媒体库</h2><p>头像、封面、图标与截图共用。上传的图片转换为 WebP；GIF 使用首帧。</p></div>
    <button type="button" className="action-secondary" onClick={() => void load()}>刷新</button></div>
    {error && <p role="alert" className="error-banner">{error}</p>}
    <div className="media-library">{items.map(item => <article key={item.name}><a href={item.url} target="_blank" rel="noopener noreferrer"><img src={item.url} alt="媒体图片" loading="lazy" /></a>
      <small>{Math.ceil(item.size / 1024)} KiB · {item.createdAt.slice(0, 10)}</small><button type="button" disabled={busy} className="text-action destructive" onClick={() => void remove(item)}>删除图片</button></article>)}</div>
    {!items.length && <p>在项目或个人资料中上传第一张图片。</p>}
  </section>
}
