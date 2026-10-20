'use client'
import { useEffect, useState } from 'react'
import { HubIcon } from '@/components/public/HubIcon'
export function ThemeControl({ defaultTheme = 'light', iconOnly = false }: { defaultTheme?: 'light' | 'dark'; iconOnly?: boolean } = {}) {
  const [dark, setDark] = useState(defaultTheme === 'dark')
  useEffect(() => {
    let theme: string = defaultTheme
    try { theme = localStorage.getItem('hub-theme') || defaultTheme } catch { /* preferences are optional */ }
    setDark(theme === 'dark'); document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'
    const sync = (event: StorageEvent) => {
      if (event.key !== 'hub-theme' && event.key !== null) return
      const next = event.newValue === 'dark'
      setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [defaultTheme])
  function toggle() {
    const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try { localStorage.setItem('hub-theme', next ? 'dark' : 'light') } catch { /* preferences are optional */ }
  }
  return <button type="button" className={'theme-toggle' + (iconOnly ? ' hub-theme-toggle' : '')} aria-label={dark ? '切换浅色模式' : '切换深色模式'} onClick={toggle}>{iconOnly ? <HubIcon name={dark ? 'sun' : 'moon'} /> : dark ? '浅色' : '深色'}</button>
}
