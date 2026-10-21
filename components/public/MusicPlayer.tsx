'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { MusicTrack } from '@/lib/types'
import { HubIcon } from './HubIcon'

type MusicState = { open: () => void; track?: MusicTrack; playing: boolean; iconUrl?: string }
const MusicContext = createContext<MusicState | null>(null)
const stamp = (value: number) => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00'

// The root layout owns one audio element, so client-side page navigation preserves playback.
export function MusicProvider({ children, playlist, iconUrl }: { children: ReactNode; playlist: MusicTrack[]; iconUrl?: string }) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [duration, setDuration] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [seekableEnd, setSeekableEnd] = useState(0)
  const [volume, setVolume] = useState(0.7)
  const [mode, setMode] = useState<'list' | 'random' | 'one'>('list')
  const audio = useRef<HTMLAudioElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const shouldPlay = useRef(false)
  const playAttempt = useRef(0)
  const pathname = usePathname()
  const studio = pathname.startsWith('/duanap')
  const track = playlist[index]

  async function play() {
    const element = audio.current
    if (!element || !track) return
    const attempt = ++playAttempt.current
    setError('')
    try { await element.play() }
    catch { if (playAttempt.current === attempt) setError('暂时无法播放这首歌，请重试或选择其他歌曲。') }
  }
  useEffect(() => {
    setElapsed(0); setDuration(0); setSeekableEnd(0); setError('')
    playAttempt.current++
    if (shouldPlay.current) { shouldPlay.current = false; void play() }
    // Only track changes start the selected song, never the initial page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, track?.url])
  useEffect(() => { if (audio.current) audio.current.volume = volume }, [volume])
  useEffect(() => {
    if (open && !studio) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open, studio])
  useEffect(() => {
    if (studio) { audio.current?.pause(); setOpen(false) }
  }, [studio])

  function choose(next: number) {
    if (!playlist.length) return
    next = (next + playlist.length) % playlist.length
    if (next === index) {
      if (audio.current) audio.current.currentTime = 0
      void play()
    } else { shouldPlay.current = true; setIndex(next) }
  }
  function nextSong(direction = 1) {
    if (mode === 'random' && playlist.length > 1) choose(index + 1 + Math.floor(Math.random() * (playlist.length - 1)))
    else choose(index + direction)
  }
  function toggle() { if (audio.current?.paused) void play(); else { playAttempt.current++; audio.current?.pause() } }
  function updateSeekable() {
    const ranges = audio.current?.seekable
    setSeekableEnd(ranges?.length ? ranges.end(ranges.length - 1) : 0)
  }

  return <MusicContext.Provider value={{ open: () => setOpen(true), track, playing, iconUrl }}>
    {children}
    <audio ref={audio} src={track?.url} preload="none" data-testid="site-audio"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onTimeUpdate={() => setElapsed(audio.current?.currentTime || 0)}
      onLoadedMetadata={() => setDuration(Number.isFinite(audio.current?.duration) ? audio.current!.duration : 0)}
      onProgress={updateSeekable} onCanPlay={updateSeekable}
      onError={() => { setPlaying(false); setError('音频暂时不可用，请重试或选择其他歌曲。') }}
      onEnded={() => { if (mode === 'one' || playlist.length === 1) choose(index); else nextSong() }} />
    <div className="hub-player-layer">
      {!studio && track && <button type="button" className={'hub-player-fab' + (playing ? ' is-playing' : '')} aria-label="打开歌曲库" onClick={() => setOpen(true)}><HubIcon name="music" src={iconUrl} /><span>{playing ? track.title : 'Listen'}</span></button>}
      <dialog ref={dialog} className="hub-player-dialog" aria-label="歌曲库与播放器" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
        <div className="hub-player-header"><span>LISTEN / MUSIC</span><button type="button" aria-label="关闭歌曲库" onClick={() => dialog.current?.close()}><HubIcon name="close" /></button></div>
        <div className="hub-player-art">{track?.coverUrl ? <img src={track.coverUrl} alt={track.title + '封面'} /> : <HubIcon name="music" src={iconUrl} />}<span className={playing ? 'is-playing' : ''}>♫</span></div>
        <h2>{track?.title || 'Not Playing'}</h2><p className="hub-player-artist">{track?.artist || (track ? 'Unknown artist' : '选一首歌，慢慢听。')}</p>
        <label className="hub-player-progress" title={duration && !seekableEnd ? '这个音源暂不支持拖动进度' : '拖动播放进度'}><span className="sr-only">播放进度</span><input aria-label="播放进度" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(elapsed, duration)} disabled={!duration || !seekableEnd} onChange={event => { if (audio.current) { const position = Math.min(Number(event.target.value), seekableEnd); audio.current.currentTime = position; setElapsed(position) } }} /></label>
        <div className="hub-player-times"><span>{stamp(elapsed)}</span><span>{stamp(duration)}</span></div>
        <div className="hub-player-controls"><button type="button" aria-label="上一首" disabled={!track} onClick={() => nextSong(-1)}>‹</button><button type="button" className="hub-player-play" aria-label={playing ? '暂停音乐' : '播放音乐'} disabled={!track} onClick={toggle}>{playing ? 'Ⅱ' : '▶'}</button><button type="button" aria-label="下一首" disabled={!track} onClick={() => nextSong()}>›</button></div>
        <div className="hub-player-options"><button type="button" onClick={() => setMode(mode === 'list' ? 'random' : mode === 'random' ? 'one' : 'list')} aria-label="切换播放模式">{({ list: '列表循环', random: '随机播放', one: '单曲循环' })[mode]}</button><label>音量<input aria-label="音量" type="range" min={0} max={1} step={0.05} value={volume} onChange={event => setVolume(Number(event.target.value))} /></label></div>
        {error && <p role="status" className="hub-player-error">{error}<button type="button" onClick={() => { audio.current?.load(); void play() }}>重试播放</button></p>}
        <label className="hub-player-search"><HubIcon name="search" /><input type="search" aria-label="搜索歌曲" value={query} placeholder="搜索歌曲或歌手…" onChange={event => setQuery(event.target.value)} /></label>
        <div className="hub-player-library" aria-label="可播放歌曲">{playlist.map((item, position) => ({ item, position })).filter(({ item }) => `${item.title} ${item.artist}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(({ item, position }) => <button type="button" key={position} className={position === index ? 'selected' : ''} aria-label={'播放歌曲：' + item.title} aria-current={position === index ? 'true' : undefined} onClick={() => choose(position)}><span className="hub-track-number">{String(position + 1).padStart(2, '0')}</span><span><strong>{item.title}</strong><small>{item.artist}</small></span><span>{position === index && playing ? '♫' : '↗'}</span></button>)}</div>
        {!playlist.length && <p className="hub-player-empty">歌曲库还没有歌曲。</p>}
        {playlist.length > 0 && !playlist.some(item => `${item.title} ${item.artist}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p className="hub-player-empty">没有找到这首歌。</p>}
      </dialog>
    </div>
  </MusicContext.Provider>
}

export function MusicTile() {
  const music = useContext(MusicContext)
  return <button type="button" className="hub-music-open" aria-label="打开歌曲库" onClick={music?.open}>
    <span className="hub-music-cover">{music?.track?.coverUrl ? <img src={music.track.coverUrl} alt="" /> : <HubIcon name="music" src={music?.iconUrl} />}<span className={'hub-music-bars' + (music?.playing ? ' is-playing' : '')}><i /><i /><i /><i /></span></span>
    <span className="hub-music-copy"><strong>{music?.playing ? music.track?.title : 'Listen to some music'}</strong><small>{music?.playing ? music.track?.artist : '选一首歌，让时间慢下来。'}</small><span className="hub-music-line" /></span><span aria-hidden="true">↗</span>
  </button>
}
