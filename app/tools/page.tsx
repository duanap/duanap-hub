import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { isEnabled, getSiteSettings } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
import { publicTools } from '@/lib/tool-settings'
export function generateMetadata(): Metadata { return pageMetadata('在线工具', '简单、实用的个人在线工具，优先保护本地隐私。', '/tools', isEnabled('tools')) }
export default function ToolsPage() {
  if (!isEnabled('tools')) notFound()
  const tools=publicTools()
  return <PublicShell><div className="page-heading"><span className="eyebrow">UTILITY KIT</span><h1>在线工具</h1><p>需要时随手打开，在浏览器本地处理数据。</p></div>
    <div className="project-grid">{tools.map(tool => <Link className="project-card" href={tool.path} key={tool.id}>
      <span className="project-avatar">{tool.id==='password'?'#':tool.id==='convert'?'MD':'IP'}</span><h3>{tool.title}</h3><p>{tool.description}</p>
      <div className="project-card-foot"><span>已开放</span><span>打开 ↗</span></div></Link>)}</div>
  </PublicShell>
}
