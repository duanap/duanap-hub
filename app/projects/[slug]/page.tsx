import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import ReactMarkdown from 'react-markdown'
import { PublicShell } from '@/components/PublicShell'
import { getProjectBySlug, getProjectByAlias, getProjectEntries, isEnabled } from '@/lib/db'
import { pageMetadata, safeJsonLd } from '@/lib/seo'
import { STATUS_LABELS, ENTRY_LABELS, ROADMAP_LABELS } from '@/lib/types'
import { SITE_BASE } from '@/lib/config'

type Props={params:Promise<{slug:string}>}
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {slug}=await params
  const project=getProjectBySlug(slug) || getProjectByAlias(slug)
  if(!project||!isEnabled('projects'))return pageMetadata('项目不存在','项目尚未发布。',`/projects/${slug}`,false)
  return pageMetadata(project.seoTitle||project.title,project.seoDescription||project.summary||project.title,`/projects/${project.slug}`, true, project.coverUrl || project.iconUrl)
}
export default async function ProjectDetail({params}:Props){
  if(!isEnabled('projects'))notFound()
  const {slug}=await params
  const p=getProjectBySlug(slug)
  if(!p) { const alias = getProjectByAlias(slug); if (alias) permanentRedirect('/projects/' + alias.slug); notFound() }
  const entries=getProjectEntries(p.id,true)
  return <PublicShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: p.title, description: p.summary, url: new URL('/projects/' + p.slug, SITE_BASE).href, softwareVersion: p.version || undefined, image: p.coverUrl ? new URL(p.coverUrl, SITE_BASE).href : undefined, applicationCategory: p.category === 'game' ? 'GameApplication' : 'WebApplication' }) }} />
    <div className="page-heading"><Link className="subtle-link" href="/projects">← 全部项目</Link><h1>{p.title}</h1><p>{p.summary}</p>
      {p.groupName && <p>{p.groupName}</p>}{p.tags.length > 0 && <div className="tag-list">{p.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
      <div className="status-row"><span className={`project-state status-${p.status}`}>{STATUS_LABELS[p.status]}</span>{p.version&&<span>当前版本 {p.version}</span>}{p.versionDate && <time dateTime={p.versionDate}>{p.versionDate}</time>}</div>
      <div className="hero-actions">{p.externalUrl&&p.status==='online'&&<a href={p.externalUrl} className="action-primary" target="_blank" rel="noopener noreferrer">在线体验 ↗</a>}{p.repositoryUrl&&<a href={p.repositoryUrl} className="action-secondary" target="_blank" rel="noopener noreferrer">源码仓库 ↗</a>}</div>
    </div>
    {p.coverUrl && <img className="project-detail-cover" src={p.coverUrl} alt={p.title + '封面'} />}
    {p.status==='maintenance'&&<div className="maintenance-note">项目正在维护或升级，最新安排请以以下公告为准。</div>}
    {p.body&&<article className="content-card markdown"><h2>项目介绍</h2><ReactMarkdown>{p.body}</ReactMarkdown></article>}
    {p.screenshots.length > 0 && <section className="home-section"><h2>项目截图</h2><div className="project-screenshots">{p.screenshots.map((url, index) => <a href={url} key={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={p.title + ' 截图 ' + (index + 1)} loading="lazy" /></a>)}</div></section>}
    {!!entries.length&&<section className="home-section"><div className="section-title"><div><span className="eyebrow">UPDATES</span><h2>更新与计划</h2></div></div>
      <div className="entry-timeline">{entries.map(e=><article key={e.id} id={`update-${e.id}`} className="content-card entry-card"><div className="entry-meta"><span>{ENTRY_LABELS[e.type]}</span>{e.version && <span>{e.version}</span>}{e.type === 'roadmap' && <span>{ROADMAP_LABELS[e.roadmapStatus]}</span>}<time>{e.publishedAt?.slice(0,10)||''}</time></div><h3>{e.title}</h3><div className="markdown"><ReactMarkdown>{e.body}</ReactMarkdown></div></article>)}</div>
    </section>}
  </PublicShell>
}
