'use client'

import { useState } from 'react'
import type { HubSettings, MusicTrack } from '@/lib/types'
import type { SettingsField } from './HomeEditor'
import { MediaPicker } from './MediaPicker'
import { AudioUploader } from './AudioUploader'

export function MusicLibraryEditor({ settings, field, onMediaBusyChange }: { settings: HubSettings; field: SettingsField; onMediaBusyChange: (busy: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<number | null>(null)
  const tracks = settings.musicPlaylist
  function change(index: number, patch: Partial<MusicTrack>) { field('musicPlaylist', tracks.map((track, position) => position === index ? { ...track, ...patch } : track)) }
  function move(index: number, direction: number) {
    const next = index + direction, values = [...tracks]
    if (next < 0 || next >= values.length) return
    ;[values[index], values[next]] = [values[next], values[index]]
    field('musicPlaylist', values)
    setActive(next)
  }
  return <div className="studio-music-library"><div className="card-heading"><div><h2>歌曲库</h2><p>{tracks.length} 首歌曲 · {tracks.filter(track => track.enabled !== false).length} 首公开。保存后用于首页和全站播放器。</p></div><button type="button" className="action-secondary" disabled={tracks.length >= 200} onClick={() => { field('musicPlaylist', [...tracks, { title: '', artist: '', url: '', coverUrl: '', enabled: true }]); setActive(tracks.length); setQuery('') }}>添加歌曲</button></div>
    <p className="form-hint">上传自己的音频文件，或填写音频直链。歌曲可暂时下架，最多保存200首。</p><label className="field"><span>搜索歌曲库</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="歌曲名称 / 歌手" /></label>
    <div className="home-playlist">{tracks.map((track, index) => ({ track, index })).filter(({ track, index }) => index === active || `${track.title} ${track.artist}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(({ track, index }) => <section className="home-track" key={index}>
      <div className="card-heading"><button type="button" className="text-action" aria-expanded={active === index} onClick={() => setActive(active === index ? null : index)}>{String(index + 1).padStart(2, '0')} · {track.title || '未命名歌曲'} {track.enabled === false ? '（已下架）' : ''}</button><label className="check-choice"><input type="checkbox" checked={track.enabled !== false} onChange={event => change(index, { enabled: event.target.checked })} />公开歌曲 {index + 1}</label></div>
      {active === index && <><div className="form-columns">{([['歌曲名称', 'title'], ['歌手', 'artist'], ['音频直链', 'url']] as const).map(([label, key]) => <label className="field" key={key}><span>{label} {index + 1}</span><input value={track[key]} maxLength={key === 'url' ? 1000 : 120} onChange={event => change(index, { [key]: event.target.value })} /></label>)}<MediaPicker label={'歌曲封面 ' + (index + 1)} value={track.coverUrl} onChange={value => change(index, { coverUrl: value })} onBusyChange={onMediaBusyChange} /></div><AudioUploader label={"歌曲音频 " + (index + 1)} value={track.url} onUploaded={(url, title) => change(index, { url, ...(!track.title.trim() ? { title } : {}) })} onBusyChange={onMediaBusyChange} /><div className="form-actions"><button type="button" className="text-action" disabled={!index} onClick={() => move(index, -1)}>上移歌曲 {index + 1}</button><button type="button" className="text-action" disabled={index === tracks.length - 1} onClick={() => move(index, 1)}>下移歌曲 {index + 1}</button><button type="button" className="text-action destructive" onClick={() => { field('musicPlaylist', tracks.filter((_, position) => position !== index)); setActive(null) }}>移除歌曲 {index + 1}</button></div></>}
    </section>)}</div>{!tracks.length && <p className="studio-empty">还没有歌曲，点击“添加歌曲”创建第一首。</p>}
  </div>
}
