import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { loadBlogIndex } from '@/lib/blog'
import { BlogList } from '@/components/public/BlogList'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  const site = getSiteSettings()
  return pageMetadata(`${site.displayName} 的博客`, '独立博客入口与文章阅读。', '/blog', false)
}
export default async function BlogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isEnabled('blog')) notFound()
  const site = getSiteSettings()
  const index = await loadBlogIndex()
  if (index.posts.length) return <PublicShell><header className="hub-page-heading"><h1>Blog</h1><p>代码、想法与日常，慢慢写下来。</p></header><BlogList index={index} params={await searchParams} blogUrl={site.blogUrl} /></PublicShell>
  return <PublicShell><header className="hub-page-heading"><h1>Blog</h1><p>代码、想法与日常，慢慢写下来。</p></header><div className="hub-page-grid">
    <article className="hub-card hub-blog-card"><h2>{site.displayName} 的独立博客</h2><p>{site.tagline}</p>{site.blogUrl ? <><p>文章在独立博客发布。前往博客阅读完整正文、归档与讨论。</p><a className="action-primary" href={site.blogUrl} target="_blank" rel="noopener noreferrer">前往博客 ↗</a><span className="hub-blog-address">{site.blogUrl}</span></> : <div className="hub-empty"><h2>博客入口尚未配置</h2><p>博客地址准备好后，会显示在这里。</p></div>}{index.status === 'unavailable' && <p className="hub-status-note" role="status">博客暂时无法连接，可以稍后重试或直接前往博客。</p>}{index.status === 'unconfigured' && <p className="hub-status-note">文章来源尚未配置。</p>}{index.status === 'ready' && <p className="hub-status-note">博客暂时没有公开文章。</p>}</article>
    <aside className="hub-sidebar"><h2>继续逛逛</h2>{isEnabled('projects') && <p><Link href="/projects">项目与作品 ↗</Link></p>}{isEnabled('notes') && <p><Link href="/notes">最近随记与动态 ↗</Link></p>}{isEnabled('about') && <p><Link href="/about">关于 {site.displayName} ↗</Link></p>}</aside>
  </div></PublicShell>
}
