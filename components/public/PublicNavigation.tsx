'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ThemeControl } from '@/components/ThemeControl'
import { HubIcon, type HubIconName } from './HubIcon'

export type PublicNavLink = { path: string; label: string; icon: HubIconName; iconUrl?: string }

export function PublicNavigation({ links, siteName, logoUrl }: { links: PublicNavLink[]; siteName: string; logoUrl?: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return <header className="hub-header">
    <div className="hub-nav-pill">
      <Link className="hub-wordmark" href="/" aria-label={siteName + '首页'} onClick={() => setOpen(false)}>{logoUrl ? <img src={logoUrl} alt="" /> : 'd.'}</Link>
      <span className="hub-nav-divider" aria-hidden="true" />
      <nav className="hub-desktop-nav" aria-label="主导航">{links.map(link => <Link key={link.path} href={link.path} title={link.label} aria-label={link.label} aria-current={pathname === link.path ? 'page' : undefined}><HubIcon name={link.icon} src={link.iconUrl} /><span className="hub-nav-tooltip">{link.label}</span></Link>)}</nav>
      <span className="hub-nav-divider hub-desktop-divider" aria-hidden="true" />
      <ThemeControl defaultTheme="dark" iconOnly />
    </div>
    <button className="hub-menu-toggle" type="button" aria-label={open ? '收起导航' : '展开导航'} aria-expanded={open} aria-controls="hub-mobile-nav" onClick={() => setOpen(!open)}><HubIcon name={open ? 'close' : 'menu'} /></button>
    {open && <nav className="hub-mobile-nav" id="hub-mobile-nav" aria-label="手机导航">{links.map(link => <Link key={link.path} href={link.path} aria-current={pathname === link.path ? 'page' : undefined} onClick={() => setOpen(false)}><HubIcon name={link.icon} src={link.iconUrl} />{link.label}</Link>)}</nav>}
  </header>
}
