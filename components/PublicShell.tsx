import type { ReactNode } from 'react'
import { getModules, getSiteSettings, isEnabled } from '@/lib/db'
import { PublicNavigation, type PublicNavLink } from '@/components/public/PublicNavigation'
import { HubIcon } from '@/components/public/HubIcon'
import type { ModuleId } from '@/lib/types'

export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const site = getSiteSettings()
  const definitions: { module: ModuleId; link: PublicNavLink; dependent?: ModuleId }[] = [
    { module: 'blog', link: { path: '/blog', label: '博客', icon: 'blog' } },
    { module: 'photos', link: { path: '/photos', label: '相册', icon: 'photos' } },
    { module: 'notes', link: { path: '/notes', label: '动态', icon: 'notes' } },
    { module: 'links', link: { path: '/links', label: '链接', icon: 'links' } },
    { module: 'about', link: { path: '/about', label: '关于我', icon: 'about' } },
    { module: 'projects', link: { path: '/projects', label: '项目', icon: 'projects' } },
    { module: 'games', dependent: 'projects', link: { path: '/games', label: '游戏', icon: 'games' } },
    { module: 'tools', link: { path: '/tools', label: '工具', icon: 'tools' } },
  ]
  const modules = getModules()
  const enabled = definitions.filter(item => isEnabled(item.module) && (!item.dependent || isEnabled(item.dependent)))
  const order = (id: ModuleId) => modules.find(module => module.id === id)?.sortOrder ?? 99
  const links = enabled.sort((a, b) => order(a.module) - order(b.module)).map(item => item.link)
  return <div className="public-app hub-public">
    <PublicNavigation links={links} siteName={site.siteName} />
    <main id="main-content" className={'site-main hub-main' + (wide ? ' hub-main-wide' : '')}>{children}</main>
    <footer className="site-footer hub-footer">
      <div>© {new Date().getFullYear()} {site.copyright||site.displayName}</div>
      <div className="footer-filings">
        {site.icpNumber&&<a href={site.icpUrl||'https://beian.miit.gov.cn/'} target="_blank" rel="noopener noreferrer">{site.icpNumber}</a>}
        {site.policeNumber&&<a href={site.policeUrl||'#'} target="_blank" rel="noopener noreferrer">{site.policeNumber}</a>}
      </div>
      <a className="hub-feed-link" href="/feed.xml" aria-label="RSS 订阅"><HubIcon name="rss" />RSS</a>
    </footer>
  </div>
}
