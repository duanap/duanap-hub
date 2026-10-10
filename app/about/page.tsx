import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { PublicShell } from '@/components/PublicShell'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata():Metadata {const s=getSiteSettings();return pageMetadata(`关于 ${s.displayName}`,s.biography.slice(0,160),'/about',isEnabled('about'))}
export default function AboutPage(){
  if(!isEnabled('about'))notFound()
  const s=getSiteSettings()
  return <PublicShell><div className="page-heading"><span className="eyebrow">ABOUT ME</span><h1>关于我</h1><p>认识 duanap，分享日常与开发实践。</p></div>
    <div className="content-card markdown"><h2>{s.displayName}</h2><ReactMarkdown>{s.biography}</ReactMarkdown>
      <div className="contact-list">{s.githubUrl&&<a href={s.githubUrl} rel="noopener noreferrer" target="_blank">GitHub ↗</a>}{s.publicEmail&&<a href={`mailto:${s.publicEmail}`}>公开邮箱 ↗</a>}</div></div>
  </PublicShell>
}
