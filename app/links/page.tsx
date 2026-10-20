import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { LinksDirectory } from '@/components/public/ContentViews'
import { isEnabled } from '@/lib/db'
import { getPublicLinks } from '@/lib/public-content'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  return pageMetadata('公开链接', '社交账号、独立博客与项目入口。', '/links', isEnabled('links') && getPublicLinks().length > 0)
}
export default function LinksPage() {
  if (!isEnabled('links')) notFound()
  const links = getPublicLinks()
  return <PublicShell><header className="hub-page-heading"><h1>Links</h1><p>{links.length} 个公开入口 · 在别处，也能找到我。</p></header>{links.length ? <LinksDirectory links={links} /> : <div className="hub-empty"><h2>暂时没有公开链接</h2><p>社交账号和已发布项目的入口会展示在这里。</p></div>}</PublicShell>
}
