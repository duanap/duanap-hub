import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { loadBlogIndex } from '@/lib/blog'
import { isEnabled } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'

async function getPost(params: Promise<{ id: string }>) {
  if (!isEnabled('blog')) notFound()
  const { id } = await params
  if (!/^[1-9]\d{0,12}$/.test(id)) notFound()
  return (await loadBlogIndex()).posts.find(post => post.id === Number(id))
}
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const post = await getPost(params)
  if (!post) return { title: '文章不存在', robots: { index: false } }
  return { ...pageMetadata(post.title, post.excerpt.slice(0, 200), '/blog/' + post.id, false), alternates: { canonical: post.url } }
}
export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const post = await getPost(params)
  if (!post) notFound()
  return <PublicShell><article className="hub-blog-detail"><Link className="subtle-link" href="/blog">← 全部文章</Link><header className="hub-page-heading"><h1>{post.title}</h1><p><time dateTime={post.date}>{post.date.slice(0, 10)}</time> · 来自独立博客</p></header>{post.imageUrl && <img className="hub-blog-hero" src={post.imageUrl} alt="" />}<div className="hub-blog-tags">{post.tags.map(tag => <Link key={tag} href={'/blog?tag=' + encodeURIComponent(tag)}>#{tag}</Link>)}</div><p className="hub-blog-excerpt">{post.excerpt || '这篇文章没有公开摘要，请前往博客阅读。'}</p><a className="action-primary" href={post.url} target="_blank" rel="noopener noreferrer">阅读完整原文与讨论 ↗</a><p className="hub-status-note">此页展示公开摘要，最新正文以独立博客为准。</p></article></PublicShell>
}
