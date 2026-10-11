import type { ReactNode } from 'react'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { PublicNavigation, type NavItem } from './PublicNavigation'
import { Icon } from './Icon'
export function PublicShell({ children }: { children: ReactNode }) {
  const site = getSiteSettings()
  const items: NavItem[] = [
    { path: '/', label: '首页', icon: 'home', enabled: true },
    { path: '/projects', label: '作品', icon: 'folder', enabled: isEnabled('projects') },
    { path: '/games', label: '游戏', icon: 'gamepad', enabled: isEnabled('games') },
    { path: '/tools', label: '工具', icon: 'grid', enabled: isEnabled('tools') },
    { path: '/about', label: '关于', icon: 'user', enabled: isEnabled('about') },
  ]
  return (
    <div className="public-app">
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>
      <PublicNavigation items={items} githubUrl={site.githubUrl} />
      <main id="main-content">{children}</main>
      <div className="landscape-strip" role="img" aria-label="夕阳与山峦插画" />
      <footer className="site-footer">
        <div className="container foot-shell">
          <div className="foot-inner">
            <span className="copyright">
              <span className="logo">
                duan<span>ap</span>
                <small>.cn</small>
              </span>
              <span>
                © {new Date().getFullYear()} · {site.copyright}
              </span>
            </span>
            <div className="foot-links">
              {site.githubUrl && (
                <a href={site.githubUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="github" />
                  GitHub
                </a>
              )}
              {site.blogUrl && (
                <a href={site.blogUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="book" />
                  博客
                </a>
              )}
              {site.publicEmail && (
                <a href={'mailto:' + site.publicEmail}>
                  <Icon name="mail" />
                  邮箱
                </a>
              )}
            </div>
          </div>
          <div className="filing-records">
            {site.icpNumber && (
              <a
                href={site.icpUrl || 'https://beian.miit.gov.cn/'}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={'ICP备案：' + site.icpNumber}
              >
                <Icon name="building" />
                <span>ICP备案：{site.icpNumber}</span>
              </a>
            )}
            {site.policeNumber && site.policeUrl && (
              <a
                href={site.policeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={'公安备案：' + site.policeNumber}
              >
                <Icon name="shield" />
                <span>公安备案：{site.policeNumber}</span>
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
