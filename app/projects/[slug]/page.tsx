import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ReactMarkdown from 'react-markdown'
import { PublicShell } from '@/components/PublicShell'
import { getProjectBySlug, getProjectEntries, isEnabled } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
import { STATUS_LABELS, ENTRY_LABELS } from '@/lib/types'

type Props={params:Promise<{slug:string}>}
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {slug}=await params
  const project=getProjectBySlug(slug)
  if(!project||!isEnabled('projects'))return pageMetadata('项目不存在','项目尚未发布。',`/projects/${slug}`,false)
  return pageMetadata(project.seoTitle||project.title,project.seoDescription||project.summary||project.title,`/projects/${slug}`)
}
export default async function ProjectDetail({params}:Props){
  if(!isEnabled('projects'))notFound()
  const {slug}=await params
  const p=getProjectBySlug(slug)
  if(!p)notFound()
  const entries=getProjectEntries(p.id,true)
  return <PublicShell>
    <div className="page-heading"><Link className="subtle-link" href="/projects">← 全部项目</Link><h1>{p.title}</h1><p>{p.summary}</p>
      <div className="status-row"><span className={`project-state status-${p.status}`}>{STATUS_LABELS[p.status]}</span>{p.version&&<span>当前版本 {p.version}</span>}</div>
      <div className="hero-actions">{p.externalUrl&&p.status==='online'&&<a href={p.externalUrl} className="action-primary" target="_blank" rel="noopener noreferrer">在线体验 ↗</a>}{p.repositoryUrl&&<a href={p.repositoryUrl} className="action-secondary" target="_blank" rel="noopener noreferrer">源码仓库 ↗</a>}</div>
    </div>
    {p.status==='maintenance'&&<div className="maintenance-note">项目正在维护或升级，最新安排请以以下公告为准。</div>}
    {p.body&&<article className="content-card markdown"><h2>项目介绍</h2><ReactMarkdown>{p.body}</ReactMarkdown></article>}
    {!!entries.length&&<section className="home-section"><div className="section-title"><div><span className="eyebrow">UPDATES</span><h2>更新与计划</h2></div></div>
      <div className="entry-timeline">{entries.map(e=><article key={e.id} id={`update-${e.id}`} className="content-card entry-card"><div className="entry-meta"><span>{ENTRY_LABELS[e.type]}</span><time>{e.publishedAt?.slice(0,10)||''}</time></div><h3>{e.title}</h3><div className="markdown"><ReactMarkdown>{e.body}</ReactMarkdown></div></article>)}</div>
    </section>}
  </PublicShell>
}
