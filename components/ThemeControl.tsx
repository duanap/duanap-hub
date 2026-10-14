'use client'
import { useEffect, useState } from 'react'
export function ThemeControl() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    let theme = 'light'
    try { theme = localStorage.getItem('hub-theme') || 'light' } catch { /* preferences are optional */ }
    setDark(theme === 'dark'); document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'
    const sync = (event: StorageEvent) => {
      if (event.key !== 'hub-theme' && event.key !== null) return
      const next = event.newValue === 'dark'
      setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  function toggle() {
    const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try { localStorage.setItem('hub-theme', next ? 'dark' : 'light') } catch { /* preferences are optional */ }
  }
  return <button type="button" className="theme-toggle" aria-label={dark ? '切换浅色模式' : '切换深色模式'} onClick={toggle}>{dark ? '浅色' : '深色'}</button>
}
