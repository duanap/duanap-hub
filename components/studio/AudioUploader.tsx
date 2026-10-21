'use client'

import { useEffect, useRef, useState } from 'react'

export function AudioUploader({ label, value, onUploaded, onBusyChange }: { label: string; value: string; onUploaded: (url: string, title: string) => void; onBusyChange: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const active = useRef(true), inFlight = useRef(false), controller = useRef<AbortController | null>(null)
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort() } }, [])
  async function upload(file?: File) {
    if (!file || inFlight.current) return
    if (file.size > 20 * 1024 * 1024) { setError('音频不能超过20 MiB'); return }
    inFlight.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('')
    controller.current = new AbortController()
    try {
      const form = new FormData(); form.set('file', file)
      const response = await fetch('/api/studio/audio', { method: 'POST', body: form, signal: controller.current.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '音频上传失败')
      if (active.current) { onUploaded(data.media.url, file.name.replace(/\.[^.]+$/, '').slice(0, 120)); setNotice('音频已上传，保存歌曲库后生效') }
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : '音频上传失败') }
    finally { inFlight.current = false; onBusyChange(false); if (active.current) setBusy(false) }
  }
  return <div className="field studio-audio-upload"><span>{label}</span><label className="action-secondary media-upload">{busy ? '上传音频中…' : '上传音频文件'}<input type="file" aria-label={'上传' + label} disabled={busy} accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/ogg,audio/flac,.mp3,.m4a,.wav,.ogg,.flac" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file) }} /></label><small>MP3、M4A、WAV、OGG、FLAC，最大20 MiB。上传后获得本站公开音频地址。</small>
    {value && <audio controls preload="none" src={value} aria-label={label + '预览'} />}
    {notice && <small role="status">{notice}</small>}{error && <p className="field-error" role="alert">{error}</p>}
  </div>
}
