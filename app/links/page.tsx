import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { LinksDirectory } from '@/components/public/ContentViews'
import { isEnabled } from '@/lib/db'
import { getPublicLinks } from '@/lib/public-content'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  return pageMetadata('友链', '一些朋友的小站。', '/links', isEnabled('links') && getPublicLinks().length > 0)
}
export default function LinksPage() {
  if (!isEnabled('links')) notFound()
  const links = getPublicLinks()
  return <PublicShell><header className="hub-page-heading"><h1>Links</h1><p>{links.length} 位朋友 · 一些喜欢的小站。</p></header>{links.length ? <LinksDirectory links={links} /> : <div className="hub-empty"><h2>暂时还没有友链</h2><p>期待在这里遇见朋友。</p></div>}</PublicShell>
}
