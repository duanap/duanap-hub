import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { ToolWorkspace } from '@/components/ToolWorkspace'
import { Icon } from '@/components/Icon'
import { publicTools } from '@/lib/tools'
import { pageMetadata } from '@/lib/seo'
type Props = { params: Promise<{ slug: string }> }
export async function generateMetadata({ params }: Props) {
  const { slug } = await params,
    t = publicTools().find((x) => x.id === slug)
  return pageMetadata(
    t?.title || '工具未启用',
    t?.summary || '当前工具不可用。',
    '/tools/' + slug,
    !!t,
  )
}
export default async function ToolPage({ params }: Props) {
  const { slug } = await params,
    t = publicTools().find((x) => x.id === slug)
  if (!t) notFound()
  return (
    <PublicShell>
      <div className="container detail-tool-page">
        <Link href="/tools" className="back-link">
          ← 返回工具中心
        </Link>
        <header className="tool-detail-heading">
          <span className={'tool-icon ' + t.color}>
            <Icon name={t.icon} />
          </span>
          <div>
            <p className="eyebrow">{t.group}</p>
            <h1>{t.title}</h1>
            <p>{t.summary}</p>
          </div>
        </header>
        <ToolWorkspace id={t.id} />
      </div>
    </PublicShell>
  )
}
