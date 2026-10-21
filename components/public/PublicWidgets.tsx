'use client'

import { useEffect, useRef, useState } from 'react'
import { HubIcon } from './HubIcon'
import type { MusicTrack } from '@/lib/types'

export function LiveClock() {
  const [time, setTime] = useState('––:––:––')
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-GB', { hour12: false }))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])
  return <div className="hub-clock" aria-label="当前时间"><time>{time}</time><span>LOCAL TIME</span></div>
}

export function ThemeOrb() {
  const [dark, setDark] = useState(true)
  useEffect(() => { setDark(document.documentElement.dataset.theme !== 'light') }, [])
  function toggle() {
    const next = document.documentElement.dataset.theme !== 'dark'
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    setDark(next)
    try {
      localStorage.setItem('hub-theme', next ? 'dark' : 'light')
      window.dispatchEvent(new StorageEvent('storage', { key: 'hub-theme', newValue: next ? 'dark' : 'light' }))
    } catch { /* Theme preferences are optional. */ }
  }
  return <button className="hub-orb" type="button" onClick={toggle} aria-label="切换昼夜主题" title={dark ? '切换浅色模式' : '切换深色模式'}><span className="hub-earth" aria-hidden="true" /><span className="hub-stars" aria-hidden="true">✦ <i>✧</i> ✦</span></button>
}

export function LocalAudio({ playlist = [] }: { playlist?: MusicTrack[] }) {
  const [source, setSource] = useState('')
  const [name, setName] = useState('Listen to some music')
  const [index, setIndex] = useState(0)
  const [error, setError] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const continuePlaying = useRef(false)
  const track = playlist[index % Math.max(playlist.length, 1)]
  const url = source || track?.url || ''
  useEffect(() => {
    if (!continuePlaying.current) return
    continuePlaying.current = false
    void audio.current?.play().catch(() => setError(true))
  }, [url])
  function choose(next: number) {
    const position = (next + playlist.length) % playlist.length
    const playing = continuePlaying.current || Boolean(audio.current && !audio.current.paused)
    continuePlaying.current = playing
    setSource(''); setIndex(position); setError(false)
    if (playlist[position]?.url === url && audio.current) {
      continuePlaying.current = false
      audio.current.currentTime = 0
      if (playing) void audio.current.play().catch(() => setError(true))
    }
  }
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  return <div className="hub-audio">
    <label className="hub-audio-cover" title="选择本地音乐">{!source && track?.coverUrl ? <img src={track.coverUrl} alt="" loading="lazy" /> : <HubIcon name="blog" />}<span className="hub-equalizer" aria-hidden="true"><i /><i /><i /><i /><i /></span><input type="file" accept="audio/*" aria-label="选择本地音乐" onChange={event => {
      const file = event.target.files?.[0]
      if (file) { setSource(URL.createObjectURL(file)); setName(file.name); setError(false) }
      event.target.value = ''
    }} /></label>
    <div className="hub-audio-body"><strong title={source ? name : track?.title || name}>{source ? name : track?.title || name}</strong>
      {track && !source && <small>{track.artist || '站点歌单'} · {index + 1}/{playlist.length}</small>}
      {url ? <audio key={url} ref={audio} controls preload="none" src={url} aria-label="音乐播放器" onError={() => setError(true)} onEnded={() => {
        if (!source && playlist.length > 1) { continuePlaying.current = true; choose(index + 1) }
      }} /> : <><small>选一首自己的音乐</small><div className="hub-audio-track" aria-hidden="true" /></>}
      {playlist.length > 0 && <div className="hub-audio-actions"><button type="button" disabled={!source && playlist.length < 2} onClick={() => choose(index - 1)} aria-label="上一首">←</button><button type="button" disabled={!source && playlist.length < 2} onClick={() => choose(index + (source ? 0 : 1))} aria-label={source ? '返回站点歌单' : '下一首'}>{source ? '返回歌单' : '→'}</button><small>封面可选择本地音乐</small></div>}
      {error && <small role="status">音频暂时无法播放。<button type="button" onClick={() => { setError(false); audio.current?.load() }}>重试</button></small>}
    </div>
  </div>
}
