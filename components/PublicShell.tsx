import Link from 'next/link'
import type { ReactNode } from 'react'
import { getModules, getSiteSettings, isEnabled } from '@/lib/db'
import { ThemeControl } from '@/components/ThemeControl'
import { QQLoginLink } from '@/components/QQLoginLink'

export function PublicShell({ children }: { children: ReactNode }) {
  const site = getSiteSettings()
  const links = [
    { path: '/about', label: '关于我', enabled: isEnabled('about') },
    { path: '/projects', label: '项目', enabled: isEnabled('projects') },
    { path: '/games', label: '游戏', enabled: isEnabled('games') && isEnabled('projects') },
    { path: '/tools', label: '工具', enabled: isEnabled('tools') }
  ]
  const modules=getModules()
  const sorted=links.sort((a,b)=>{
    const group=(path:string)=>path==='/about'?'about':path==='/projects'?'projects':path==='/games'?'games':'tools'
    const order=(path:string)=>modules.find(m=>m.id===group(path))?.sortOrder??99
    return order(a.path)-order(b.path)
  })
  return <div className="public-app">
    <header className="site-header">
      <Link href="/" className="site-brand"><span className="brand-icon">d.</span><span>{site.siteName}</span></Link>
      <nav aria-label="主导航" className="site-nav">
        {sorted.filter(link=>link.enabled).map(link=><Link href={link.path} key={link.path}>{link.label}</Link>)}
        {process.env.HUB_ACCOUNTS_ENABLED==='1'&&isEnabled('accounts')&&<Link href="/account">账号</Link>}
        <QQLoginLink compact />
        <ThemeControl />
      </nav>
    </header>
    <main id="main-content" className="site-main">{children}</main>
    <footer className="site-footer">
      <div>© {new Date().getFullYear()} {site.copyright||site.displayName}</div>
      <div className="footer-filings">
        {site.icpNumber&&<a href={site.icpUrl||'https://beian.miit.gov.cn/'} target="_blank" rel="noopener noreferrer">{site.icpNumber}</a>}
        {site.policeNumber&&<a href={site.policeUrl||'#'} target="_blank" rel="noopener noreferrer">{site.policeNumber}</a>}
      </div>
    </footer>
  </div>
}
