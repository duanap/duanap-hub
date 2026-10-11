import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { Hero } from '@/components/Hero'
import { ToolCatalog } from '@/components/ToolCatalog'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { publicTools } from '@/lib/tools'
import { pageMetadata } from '@/lib/seo'
export function generateMetadata() {
  return pageMetadata(
    '在线工具',
    '简单、免费，在浏览器本地处理数据。',
    '/tools',
    isEnabled('tools'),
  )
}
export default function ToolsPage() {
  if (!isEnabled('tools')) notFound()
  return (
    <PublicShell>
      <Hero
        site={getSiteSettings()}
        kind="tools"
        title="一些顺手的"
        accent="小工具。"
        description="简单、免费，打开就能使用。"
      />
      <ToolCatalog items={publicTools()} />
    </PublicShell>
  )
}
