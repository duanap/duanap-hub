import Link from 'next/link'
import type { Metadata } from 'next'
import { ProjectCard } from '@/components/ProjectCard'
import { PublicShell } from '@/components/PublicShell'
import { getSiteSettings, listProjects, recentPublicEntries, isEnabled } from '@/lib/db'
import { pageMetadata, safeJsonLd } from '@/lib/seo'
import { SITE_BASE } from '@/lib/config'
import { ENTRY_LABELS } from '@/lib/types'

export function generateMetadata():Metadata {
  const s=getSiteSettings()
  return pageMetadata(s.seoTitle,s.seoDescription,'/')
}
export default function HomePage() {
  const site=getSiteSettings()
  const showAbout=isEnabled('about')
  const showProjects=isEnabled('projects')
  const showGames=isEnabled('games')&&showProjects
  const showTools=isEnabled('tools')
  const projects=showProjects?listProjects({publishedOnly:true,limit:6}):[]
  const gameCount=showGames?listProjects({publishedOnly:true,category:'game'}).length:0
  const recent=showProjects?recentPublicEntries(3):[]
  const jsonLd={'@context':'https://schema.org','@graph':[
    {'@type':'WebSite','@id':`${SITE_BASE}#website`,name:site.siteName,url:SITE_BASE,inLanguage:'zh-CN'},
    {'@type':'Person','@id':`${SITE_BASE}#person`,name:site.displayName,url:SITE_BASE,description:site.biography}
  ]}
  return <PublicShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:safeJsonLd(jsonLd)}}/>
    <section className="hero">
      <span className="eyebrow">DUANAP / PERSONAL SPACE</span>
      <h1>{site.displayName}<span className="hero-period">.</span></h1>
      <p className="hero-lead">{site.tagline}</p>
      <p className="hero-body">{site.biography}</p>
      <div className="hero-actions">
        {showProjects&&<Link className="action-primary" href="/projects">探索作品 <span>↗</span></Link>}
        {showAbout&&<Link className="action-secondary" href="/about">关于我</Link>}
      </div>
    </section>
    {showProjects&&<section className="home-section">
      <div className="section-title"><div><span className="eyebrow">SELECTED WORK</span><h2>项目与作品</h2></div><Link href="/projects" className="subtle-link">查看全部 ↗</Link></div>
      {projects.length?<div className="project-grid">{projects.map(p=><ProjectCard key={p.id} project={p}/>)}</div>:
      <div className="soft-placeholder">项目内容将在后台发布后显示。</div>}
    </section>}
    {showGames&&<section className="home-section"><div className="section-title"><div><span className="eyebrow">PLAY & EXPLORE</span><h2>小游戏</h2></div><Link className="subtle-link" href="/games">进入游戏中心 ↗</Link></div>
      <div className="feature-row"><span>这里收集我开发的小游戏及玩法介绍。</span><span>{gameCount} 个已发布游戏</span></div>
    </section>}
    {recent.length>0&&showProjects&&<section className="home-section"><div className="section-title"><div><span className="eyebrow">WHAT'S NEW</span><h2>最近动态</h2></div><Link href="/feed.xml" className="subtle-link">RSS 订阅 ↗</Link></div>
      <div className="updates-grid">{recent.map(e=><Link href={`/projects/${e.projectSlug}#update-${e.id}`} key={e.id} className="update-item"><small>{ENTRY_LABELS[e.type]} · {e.projectTitle}</small><strong>{e.title}</strong><span>{e.publishedAt?.slice(0,10)||''}</span></Link>)}</div>
    </section>}
    {showTools&&<section className="home-section"><div className="section-title"><div><span className="eyebrow">USEFUL THINGS</span><h2>在线工具</h2></div><Link href="/tools" className="subtle-link">工具中心 ↗</Link></div>
      <Link href="/tools/password" className="tool-feature"><div><strong>安全密码生成器</strong><p>本地生成随机密码，不上传服务器。</p></div><span>前往使用 ↗</span></Link>
    </section>}
  </PublicShell>
}
