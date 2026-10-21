import { getSiteSettings, isEnabled } from '@/lib/db'
import { contentSourceUrl, contentSnapshot, refreshContent } from '@/lib/content'
import type { BlogIndex } from '@/lib/types'

// Archive pages and the existing homepage/RSS share one public source and cache.
export const wordpressSource = contentSourceUrl
export async function loadBlogIndex(force = false): Promise<BlogIndex> {
  const empty = { posts: [], fetchedAt: '', stale: false, truncated: false }
  if (!isEnabled('blog') || !isEnabled('content') || !getSiteSettings().blogSyncEnabled) return { ...empty, status: 'disabled' }
  if (!contentSourceUrl()) return { ...empty, status: 'unconfigured' }
  const snapshot = await refreshContent(force).catch(() => contentSnapshot())
  return {
    posts: snapshot.posts.map(post => ({ id: post.id, title: post.title, excerpt: post.summary, url: post.url, date: post.publishedAt, imageUrl: post.coverUrl, tags: [...new Set([...(post.tags || []), ...snapshot.categories.filter(category => post.categoryIds.includes(category.id)).map(category => category.name)])] })),
    fetchedAt: snapshot.syncedAt, stale: Boolean(snapshot.error && snapshot.syncedAt), truncated: Boolean(snapshot.truncated),
    status: snapshot.error ? 'unavailable' : 'ready',
  }
}
