import type { ReactNode } from 'react'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { PublicNavigation, type PublicNavLink } from '@/components/public/PublicNavigation'
import { HubIcon } from '@/components/public/HubIcon'
import type { ModuleId } from '@/lib/types'

export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const site = getSiteSettings()
  const definitions: { module: ModuleId; link: PublicNavLink; dependent?: ModuleId }[] = [
    { module: 'blog', link: { path: '/blog', label: '博客', icon: 'blog' } },
    { module: 'photos', link: { path: '/photos', label: '相册', icon: 'photos' } },
    { module: 'notes', link: { path: '/notes', label: '文案', icon: 'notes' } },
    { module: 'links', link: { path: '/links', label: '链接', icon: 'links' } },
    { module: 'about', link: { path: '/about', label: '关于我', icon: 'about' } },
  ]
  const enabled = definitions.filter(item => isEnabled(item.module) && (!item.dependent || isEnabled(item.dependent)))
  const links = enabled.map(item => ({ ...item.link, iconUrl: site.publicIcons[item.module as 'blog' | 'photos' | 'notes' | 'links' | 'about'] }))
  return <div className="public-app hub-public">
    <PublicNavigation links={links} siteName={site.siteName} logoUrl={site.publicIcons.logo} />
    <main id="main-content" className={'site-main hub-main' + (wide ? ' hub-main-wide' : '')}>{children}</main>
    <footer className="site-footer hub-footer">
      <div>© {new Date().getFullYear()} {site.copyright||site.displayName}</div>
      <div className="footer-filings">
        {site.icpNumber&&<a href={site.icpUrl||'https://beian.miit.gov.cn/'} target="_blank" rel="noopener noreferrer">{site.icpNumber}</a>}
        {site.policeNumber&&<a href={site.policeUrl||'#'} target="_blank" rel="noopener noreferrer">{site.policeNumber}</a>}
      </div>
      <a className="hub-feed-link" href="/feed.xml" aria-label="RSS 订阅"><HubIcon name="rss" src={site.publicIcons.rss} />RSS</a>
    </footer>
  </div>
}
