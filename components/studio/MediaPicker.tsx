'use client'
import { useEffect, useId, useRef, useState } from 'react'
import type { MediaItem } from '@/lib/media'

export function MediaPicker({ label, value, onChange, onBusyChange }: { label: string; value: string; onChange: (value: string) => void; onBusyChange?: (busy: boolean) => void }) {
  const id = useId()
  const [items, setItems] = useState<MediaItem[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort() } }, [])
  async function load() {
    setError('')
    try {
      const response = await fetch('/api/studio/media', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '媒体库读取失败')
      if (active.current) { setItems(data.media); setOpen(true) }
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '读取失败') }
  }
  async function upload(file?: File) {
    if (!file || busy) return
    if (file.size > 5 * 1024 * 1024) { setError('图片不能超过 5 MiB'); return }
    setBusy(true); onBusyChange?.(true); setError(''); controller.current = new AbortController()
    try {
      const form = new FormData(); form.set('file', file)
      const response = await fetch('/api/studio/media', { method: 'POST', body: form, signal: controller.current.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '上传失败')
      if (active.current) { onChange(data.media.url); setOpen(false) }
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '上传失败') }
    finally { onBusyChange?.(false); if (active.current) setBusy(false) }
  }
  return <div className="field media-picker">
    <label htmlFor={id}>{label}</label>
    <input id={id} value={value} placeholder="上传图片、选择媒体库或填写 https:// 地址" disabled={busy} onChange={event => onChange(event.target.value)} />
    {value && <img className="media-picker-preview" src={value} alt={label + '预览'} loading="lazy" />}
    <div className="media-picker-actions"><label className="action-secondary media-upload">
      {busy ? '上传中…' : '上传图片'}<input aria-label={'上传' + label} disabled={busy} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
    </label><button type="button" className="text-action" disabled={busy} onClick={() => open ? setOpen(false) : void load()}>{open ? '收起媒体库' : '从媒体库选择'}</button></div>
    {open && <div className="media-picker-grid">{items.length ? items.map(item => <button type="button" key={item.name} aria-label={'选择图片 ' + item.name}
      onClick={() => { onChange(item.url); setOpen(false) }}><img src={item.url} alt="" loading="lazy" /></button>) : <p>媒体库还没有图片。</p>}</div>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </div>
}
