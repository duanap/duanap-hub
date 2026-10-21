import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Markdown } from '@/components/Markdown'
import { PublicShell } from '@/components/PublicShell'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
import { getPublicAlbums, getPublicLinks, getPublicNotes } from '@/lib/public-content'
import Link from 'next/link'

export function generateMetadata():Metadata {const s=getSiteSettings();return pageMetadata(`关于 ${s.displayName}`,s.biography.slice(0,160),'/about',isEnabled('about'))}
export default function AboutPage(){
  if(!isEnabled('about'))notFound()
  const s=getSiteSettings()
  const tags = s.homeTags
  const albumCount = isEnabled('photos') ? getPublicAlbums().length : 0
  const noteCount = isEnabled('notes') ? getPublicNotes().length : 0
  const friendCount = isEnabled('links') ? getPublicLinks().length : 0
  return <PublicShell><header className="hub-page-heading"><h1>About</h1><p>关于 {s.displayName}</p></header>
    <div className="hub-about-layout"><article>
      <section className="hub-card hub-profile-card">{s.avatarUrl ? <img className="hub-profile-avatar" src={s.avatarUrl} alt={s.displayName + '头像'} /> : <span className="hub-profile-avatar" aria-hidden="true">{s.displayName.slice(0, 1)}</span>}<h2>{s.displayName}</h2><p>{s.tagline}</p>
        <div className="contact-list">{s.githubUrl&&<a href={s.githubUrl} rel="noopener noreferrer" target="_blank">GitHub ↗</a>}{s.publicEmail&&<a href={`mailto:${s.publicEmail}`}>公开邮箱 ↗</a>}{s.socialLinks.map((link,index)=><a href={link.url} key={index} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
      </section>
      <section className="hub-about-section" id="introduction"><h2>关于我</h2><div className="markdown"><Markdown>{s.biography}</Markdown></div></section>
      <section className="hub-about-section" id="public-content"><h2>一些记录</h2><div className="hub-stats"><div className="hub-card"><strong>{friendCount}</strong><small>朋友</small></div><div className="hub-card"><strong>{albumCount}</strong><small>相册</small></div><div className="hub-card"><strong>{noteCount}</strong><small>朋友圈文案</small></div></div></section>
      {!!tags.length && <section className="hub-about-section" id="interests"><h2>兴趣与日常</h2><div className="hub-tag-cloud">{tags.map(tag => <span key={tag}>{tag}</span>)}</div></section>}
      <section className="hub-about-section" id="contact"><h2>保持联系</h2><div className="hub-contact-buttons">{s.publicEmail && <a className="action-primary" href={'mailto:' + s.publicEmail}>发邮件 ↗</a>}{isEnabled('links') && <Link className="action-secondary" href="/links">更多公开入口 ↗</Link>}{isEnabled('blog') && <Link className="action-secondary" href="/blog">独立博客 ↗</Link>}</div></section>
    </article><aside className="hub-sidebar"><h2>On this page</h2><nav className="hub-toc" aria-label="关于页目录"><a href="#introduction">关于我</a><a href="#public-content">一些记录</a>{!!tags.length && <a href="#interests">兴趣与日常</a>}<a href="#contact">保持联系</a></nav></aside></div>
  </PublicShell>
}
