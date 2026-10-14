import Link from 'next/link'
import { Markdown } from '@/components/Markdown'
import type { Metadata } from 'next'
import { ProjectCard } from '@/components/ProjectCard'
import { PublicShell } from '@/components/PublicShell'
import { getSiteSettings, getModules, listProjects, recentPublicEntries, isEnabled } from '@/lib/db'
import { pageMetadata, safeJsonLd } from '@/lib/seo'
import { SITE_BASE } from '@/lib/config'
import { ENTRY_LABELS } from '@/lib/types'

export function generateMetadata(): Metadata {
  const site = getSiteSettings()
  return pageMetadata(site.seoTitle, site.seoDescription, '/')
}
export default function HomePage() {
  const site = getSiteSettings(), showProjects = isEnabled('projects')
  const projects = showProjects ? listProjects({ publishedOnly: true, limit: site.homeProjectsLimit }) : []
  const games = showProjects ? listProjects({ publishedOnly: true, category: 'game', limit: 3 }) : []
  const recent = showProjects && site.homeShowUpdates ? recentPublicEntries(3) : []
  const modules = getModules().filter(module => module.enabled && module.available)
  const jsonLd = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': SITE_BASE + '#website', name: site.siteName, url: SITE_BASE, inLanguage: 'zh-CN' },
    { '@type': 'Person', '@id': SITE_BASE + '#person', name: site.displayName, url: SITE_BASE, description: site.tagline,
      image: site.avatarUrl ? new URL(site.avatarUrl, SITE_BASE).href : undefined, sameAs: [site.githubUrl, ...site.socialLinks.map(link => link.url)].filter(Boolean) },
  ] }
  return <PublicShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
    <section className="hero">
      {site.avatarUrl && <img className="hero-avatar" src={site.avatarUrl} alt={site.displayName + '头像'} />}
      <span className="eyebrow">DUANAP / PERSONAL SPACE</span>
      <h1>{site.displayName}<span className="hero-period">.</span></h1>
      <p className="hero-lead">{site.tagline}</p>
      <div className="hero-actions">
        {showProjects && <Link className="action-primary" href="/projects">探索作品 <span>↗</span></Link>}
        {isEnabled('about') && <Link className="action-secondary" href="/about">关于我</Link>}
      </div>
      <div className="contact-list">{site.githubUrl && <a href={site.githubUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
        {site.publicEmail && <a href={'mailto:' + site.publicEmail}>公开邮箱</a>}{site.socialLinks.map((link, index) => <a href={link.url} key={index} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
    </section>
    {modules.map(module => {
      if (module.id === 'about') return <section className="home-section" data-module="about" key="about">
        <div className="section-title"><div><span className="eyebrow">ABOUT ME</span><h2>关于我</h2></div><Link className="subtle-link" href="/about">完整介绍 ↗</Link></div>
        <div className="content-card markdown"><Markdown>{site.biography}</Markdown></div>
      </section>
      if (module.id === 'projects') return <section className="home-section" data-module="projects" key="projects">
        <div className="section-title"><div><span className="eyebrow">SELECTED WORK</span><h2>项目与作品</h2></div><Link href="/projects" className="subtle-link">查看全部 ↗</Link></div>
        {projects.length ? <div className={'project-grid ' + (site.homeLayout === 'compact' ? 'compact-projects' : '')}>{projects.map(project => <ProjectCard key={project.id} project={project} />)}</div>
          : <div className="soft-placeholder">作品即将发布。</div>}
        {recent.length > 0 && <><div className="section-title updates-heading"><h2>最近动态</h2><Link href="/feed.xml" className="subtle-link">RSS 订阅 ↗</Link></div>
          <div className="updates-grid">{recent.map(entry => <Link href={'/projects/' + entry.projectSlug + '#update-' + entry.id} key={entry.id} className="update-item"><small>{ENTRY_LABELS[entry.type]} · {entry.projectTitle}</small><strong>{entry.title}</strong><span>{entry.publishedAt?.slice(0, 10) || ''}</span></Link>)}</div></>}
      </section>
      if (module.id === 'games' && showProjects) return <section className="home-section" data-module="games" key="games">
        <div className="section-title"><div><span className="eyebrow">PLAY & EXPLORE</span><h2>小游戏</h2></div><Link href="/games" className="subtle-link">进入游戏中心 ↗</Link></div>
        {games.length ? <div className="project-grid">{games.map(game => <ProjectCard key={game.id} project={game} />)}</div> : <div className="soft-placeholder">游戏作品即将发布。</div>}
      </section>
      if (module.id === 'tools') return <section className="home-section" data-module="tools" key="tools">
        <div className="section-title"><div><span className="eyebrow">USEFUL THINGS</span><h2>在线工具</h2></div><Link href="/tools" className="subtle-link">工具中心 ↗</Link></div>
        <Link href="/tools/password" className="tool-feature"><div><strong>{site.passwordToolTitle}</strong><p>{site.passwordToolDescription}</p></div><span>前往使用 ↗</span></Link>
      </section>
      return null
    })}
  </PublicShell>
}
