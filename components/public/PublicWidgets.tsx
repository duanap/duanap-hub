'use client'

import { useEffect, useState } from 'react'
import { HubIcon } from './HubIcon'

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
