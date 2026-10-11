'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { ThemeToggle } from './ThemeToggle'
export type NavItem = { path: string; label: string; icon: IconName; enabled: boolean }
export function PublicNavigation({ items, githubUrl }: { items: NavItem[]; githubUrl: string }) {
  const pathname = usePathname(),
    [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const scroll = () => setScrolled(window.scrollY > 12)
    scroll()
    window.addEventListener('scroll', scroll, { passive: true })
    return () => window.removeEventListener('scroll', scroll)
  }, [])
  const active = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path))
  return (
    <>
      <header className={'site-header ' + (scrolled ? 'is-scrolled' : '')}>
        <div className="container header-inner">
          <Link className="brand" href="/" aria-label="duanap 首页">
            <span className="logo">
              duan<span>ap</span>
              <small>.cn</small>
            </span>
          </Link>
          <nav className="desktop-links" aria-label="主导航">
            {items
              .filter((x) => x.enabled)
              .map((x) => (
                <Link key={x.path} href={x.path} aria-current={active(x.path) ? 'page' : undefined}>
                  {x.label}
                </Link>
              ))}
          </nav>
          <div className="header-actions">
            {githubUrl && (
              <a
                className="icon-button gh-btn"
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <Icon name="github" />
              </a>
            )}
            <ThemeToggle />
            <Link href="/account" className="login-pill" title="统一账号将在 P2 完善">
              <Icon name="user" />
              <span>账号 · 待完善</span>
            </Link>
          </div>
        </div>
      </header>
      <nav className="mobile-bottom-bar public-bottom-bar" aria-label="手机底部主导航">
        {items.map((x) =>
          x.enabled ? (
            <Link
              key={x.path}
              href={x.path}
              className={'bottom-item ' + (active(x.path) ? 'is-selected' : '')}
              aria-current={active(x.path) ? 'page' : undefined}
            >
              <Icon name={x.icon} />
              <span>{x.label}</span>
            </Link>
          ) : (
            <span key={x.path} className="bottom-item disabled" aria-disabled="true">
              <Icon name={x.icon} />
              <span>{x.label}</span>
            </span>
          ),
        )}
      </nav>
    </>
  )
}
