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
    if (busy || !window.confirm('删除这个媒体文件？已被内容引用的文件会保留。')) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/studio/media/' + item.name, { method: 'DELETE' }), data = await response.json()
      if (!response.ok) throw new Error(data.error || '删除失败')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '删除失败') }
    finally { setBusy(false) }
  }
  return <section className="studio-card"><div className="card-heading"><div><h2>媒体库</h2><p>管理图片与歌曲库音频。上传图片转换为 WebP；GIF 使用首帧。</p></div>
    <button type="button" className="action-secondary" onClick={() => void load()}>刷新</button></div>
    {error && <p role="alert" className="error-banner">{error}</p>}
    <div className="media-library">{items.map(item => <article key={item.name}>{item.mime.startsWith('audio/') ? <audio controls preload="none" src={item.url} aria-label={'音频预览 ' + item.name} /> : <a href={item.url} target="_blank" rel="noopener noreferrer"><img src={item.url} alt="媒体图片" loading="lazy" /></a>}
      <small>{item.mime.startsWith('audio/') ? '音频 · ' : ''}{Math.ceil(item.size / 1024)} KiB · {item.createdAt.slice(0, 10)}</small><button type="button" disabled={busy} className="text-action destructive" onClick={() => void remove(item)}>{item.mime.startsWith('audio/') ? '删除音频' : '删除图片'}</button></article>)}</div>
    {!items.length && <p>在资料、相册或歌曲库中上传第一个媒体文件。</p>}
  </section>
}
