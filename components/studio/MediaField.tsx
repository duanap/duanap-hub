'use client'
import { useEffect, useState } from 'react'
import type { MediaItem } from '@/lib/media'
import { studioApi } from './client'
export function MediaField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [items, setItems] = useState<MediaItem[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    void studioApi<{ media: MediaItem[] }>('/api/studio/media')
      .then((r) => setItems(r.media))
      .catch(() => {})
  }, [])
  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch('/api/studio/media', { method: 'POST', body: form }),
        data = await r.json()
      if (!r.ok) throw new Error(data.error || '上传失败')
      setItems(data.media)
      onChange(data.item.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="field media-field">
      <label>
        <span>{label}</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="站内媒体路径或 HTTPS 链接"
        />
      </label>
      {value && <img src={value} className="field-image-preview" alt={label + ' 预览'} />}
      <div className="form-actions">
        <label className="button button-outline">
          {busy ? '正在上传…' : '上传图片'}
          <input
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <select
          aria-label={'选择已有' + label}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value)
          }}
        >
          <option value="">从媒体库选择</option>
          {items.map((m) => (
            <option value={m.url} key={m.id}>
              {m.originalName}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="result-error">
          {error}
        </p>
      )}
      <small className="muted">最多 5 MiB；安全转为 WebP，GIF 保存首帧。</small>
    </div>
  )
}
