'use client'
import { useEffect, useState } from 'react'
import { Icon } from './Icon'
export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark')
  }, [])
  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.dataset.theme = next ? 'dark' : 'light'
    try {
      localStorage.setItem('hub-theme', next ? 'dark' : 'light')
    } catch {}
  }
  return (
    <button
      className="theme-switch"
      onClick={toggle}
      aria-label={dark ? '切换浅色主题' : '切换深色主题'}
      aria-pressed={dark}
    >
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  )
}
