import Link from 'next/link'
import { businessDay } from '@/lib/dates'
import { PublicShell } from '@/components/PublicShell'
import { Hero } from '@/components/Hero'
import { ProjectCard } from '@/components/ProjectCard'
import { Icon } from '@/components/Icon'
import { getModules, getSiteSettings, listProjects, recentPublicEntries, isEnabled } from '@/lib/db'
import { pageMetadata, safeJsonLd } from '@/lib/seo'
import { SITE_BASE } from '@/lib/config'
import { publicTools } from '@/lib/tools'
export function generateMetadata() {
  const s = getSiteSettings()
  return pageMetadata(s.seoTitle, s.seoDescription, '/')
}
export default function HomePage() {
  const s = getSiteSettings(),
    modules = getModules().filter((m) => isEnabled(m.id)),
    projects = isEnabled('projects') ? listProjects({ publishedOnly: true, limit: 3 }) : [],
    recent = isEnabled('updates') ? recentPublicEntries(4) : []
  const json = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: s.siteName, url: SITE_BASE },
      { '@type': 'Person', name: s.displayName, url: SITE_BASE, description: s.tagline },
    ],
  }
  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(json) }} />
      {!isEnabled('about') && (
        <div className="container core-intro">
          <h1>{s.displayName}</h1>
          <p>{s.tagline}</p>
        </div>
      )}
      {modules.map((m) => {
        if (m.id === 'about')
          return (
            <Hero
              key={m.id}
              site={s}
              showProjects={isEnabled('projects')}
              showAbout={isEnabled('about')}
            />
          )
        if (m.id === 'projects')
          return (
            <section key={m.id} className="container section-block">
              <div className="section-heading">
                <div>
                  <p className="eyebrow subdued">精选作品</p>
                  <h2>最近做的一些东西。</h2>
                </div>
                <Link className="link-arrow" href="/projects">
                  全部作品 <Icon name="arrow" />
                </Link>
              </div>
              {projects.length ? (
                <div className="home-projects">
                  {projects.map((p, i) => (
                    <div key={p.id} className={i === 0 ? 'home-first' : ''}>
                      <ProjectCard project={p} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact">
                  <h3>作品还在整理中。</h3>
                  <p>认真做的小东西，会陆续放在这里。</p>
                </div>
              )}
            </section>
          )
        if (m.id === 'games')
          return (
            <section key={m.id} className="container section-block game-invitation">
              <div>
                <p className="eyebrow">PLAY A LITTLE</p>
                <h2>一起玩点有趣的。</h2>
                <p>查看玩法、版本和开发计划，认识我的小游戏。</p>
              </div>
              <Link href="/games" className="button button-outline">
                游戏中心 <Icon name="gamepad" />
              </Link>
            </section>
          )
        if (m.id === 'updates')
          return (
            <section key={m.id} className="container section-block">
              <div className="section-heading">
                <div>
                  <p className="eyebrow subdued">最近动态</p>
                  <h2>最近在折腾什么？</h2>
                </div>
                <Link href="/feed.xml" className="link-arrow">
                  RSS 订阅
                </Link>
              </div>
              {recent.length ? (
                <ol className="timeline">
                  {recent.map((e) => (
                    <li key={e.id}>
                      <span className="timeline-dot selected" />
                      <time className="timeline-date">
                        {e.publishedAt ? businessDay(e.publishedAt) : ''}
                      </time>
                      <div>
                        <Link href={'/projects/' + e.projectSlug + '#update-' + e.id}>
                          <strong>{e.title}</strong>
                        </Link>
                        <p>{e.projectTitle}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="quiet-empty">暂时没有已发布动态，欢迎之后再来。</p>
              )}
            </section>
          )
        if (m.id === 'tools')
          return (
            <section key={m.id} className="container section-block">
              <div className="section-heading">
                <div>
                  <p className="eyebrow subdued">常用工具</p>
                  <h2>一些顺手的小工具。</h2>
                </div>
                <Link href="/tools" className="link-arrow">
                  更多工具 <Icon name="arrow" />
                </Link>
              </div>
              <div className="tool-mini-grid">
                {publicTools()
                  .slice(0, 4)
                  .map((t) => (
                    <Link key={t.id} className="tool-mini" href={'/tools/' + t.id}>
                      <span className={'tool-icon ' + t.color}>
                        <Icon name={t.icon} />
                      </span>
                      <div>
                        <strong>{t.title}</strong>
                        <small>{t.group} · 本地处理</small>
                      </div>
                      <Icon name="arrow" />
                    </Link>
                  ))}
              </div>
              <p className="form-hint">不上传你的输入。</p>
            </section>
          )
        return null
      })}
    </PublicShell>
  )
}
