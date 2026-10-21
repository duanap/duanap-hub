import Link from 'next/link'
import { HubIcon } from './HubIcon'
import type { BlogIndex } from '@/lib/types'

export function BlogList({ index, params, blogUrl }: { index: BlogIndex; params: Record<string, string | string[] | undefined>; blogUrl: string }) {
  const query = typeof params.q === 'string' ? params.q.slice(0, 200).trim() : ''
  const tag = typeof params.tag === 'string' ? params.tag.slice(0, 60) : ''
  const filtered = index.posts.filter(post => (!tag || post.tags.includes(tag)) && (!query || (post.title + ' ' + post.excerpt + ' ' + post.tags.join(' ')).toLocaleLowerCase().includes(query.toLocaleLowerCase())))
  const pages = Math.max(1, Math.ceil(filtered.length / 9)), page = Math.max(1, Math.min(pages, Number(params.page) || 1)) | 0
  const tags = [...new Set(index.posts.flatMap(post => post.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  function href(values: { tag?: string; page?: number }) {
    const search = new URLSearchParams()
    if (query) search.set('q', query)
    if (values.tag) search.set('tag', values.tag)
    if (values.page && values.page > 1) search.set('page', String(values.page))
    return '/blog' + (search.size ? '?' + search.toString() : '')
  }
  return <div className="hub-page-grid"><section className="hub-blog-list" aria-label="博客文章">
    <form className="hub-content-toolbar" action="/blog"><label className="hub-search"><HubIcon name="search" /><input type="search" name="q" aria-label="搜索文章" placeholder="搜索文章…" defaultValue={query} maxLength={200} /></label>{tag && <input type="hidden" name="tag" value={tag} />}<button type="submit" className="hub-pill-link">搜索</button><small>{filtered.length} 篇文章</small></form>
    {tag && <p className="hub-blog-filter">标签：{tag} <Link href={href({})}>清除标签 ×</Link></p>}
    <div className="hub-articles">{filtered.slice((page - 1) * 9, page * 9).map(post => <article className="hub-card hub-article" key={post.id}>
      {post.imageUrl && <Link className="hub-article-cover" href={'/blog/' + post.id}><img src={post.imageUrl} alt="" loading="lazy" /></Link>}
      <div><time dateTime={post.date}>{post.date.slice(0, 10)}</time><h2><Link href={'/blog/' + post.id}>{post.title}</Link></h2><p>{post.excerpt}</p><div className="hub-blog-tags">{post.tags.slice(0, 5).map(value => <Link key={value} href={href({ tag: value })}>#{value}</Link>)}</div><Link className="hub-article-read" href={'/blog/' + post.id}>阅读摘要 ↗</Link></div>
    </article>)}</div>
    {!filtered.length && <div className="hub-empty" role="status">没有找到匹配的文章。<Link href="/blog">清除筛选</Link></div>}
    {pages > 1 && <nav className="hub-pagination" aria-label="文章分页">{page > 1 && <Link href={href({ tag, page: page - 1 })}>← 上一页</Link>}<span>{page} / {pages}</span>{page < pages && <Link href={href({ tag, page: page + 1 })}>下一页 →</Link>}</nav>}
    {index.status === 'unavailable' && <p className="hub-status-note" role="status">博客暂时无法连接，正在显示上次保存的摘要。</p>}
    <p className="hub-status-note">来源：WordPress 公开文章 · 摘要更新于 <time dateTime={index.fetchedAt}>{index.fetchedAt.replace('T', ' ').slice(0, 16)} UTC</time>{index.truncated && ' · 显示最近500篇，完整归档请前往博客'}。正文与讨论在独立博客。</p>
  </section><aside className="hub-sidebar"><h2>文章标签与分类</h2><div className="hub-blog-tags">{tags.map(value => <Link key={value} href={href({ tag: value })} aria-current={tag === value ? 'page' : undefined}>{value}</Link>)}</div><h2>继续逛逛</h2>{blogUrl && <p><a href={blogUrl} target="_blank" rel="noopener noreferrer">独立博客 ↗</a></p>}<p><Link href="/">返回首页 ↗</Link></p></aside></div>
}
