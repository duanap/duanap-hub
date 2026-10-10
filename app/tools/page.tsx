import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { isEnabled } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
export function generateMetadata():Metadata{return pageMetadata('在线工具','简单、实用的个人在线工具，优先保护本地隐私。','/tools',isEnabled('tools'))}
export default function ToolsPage(){if(!isEnabled('tools'))notFound();return <PublicShell>
  <div className="page-heading"><span className="eyebrow">UTILITY KIT</span><h1>在线工具</h1><p>需要时随手打开。部分工具仅在浏览器本地处理数据。</p></div>
  <div className="project-grid"><Link className="project-card" href="/tools/password"><span className="project-avatar">#</span><h3>安全密码生成器</h3><p>自定义字符集和长度，在本机浏览器内生成随机密码。</p><div className="project-card-foot"><span>已开放</span><span>打开 ↗</span></div></Link>
  <div className="project-card disabled-card"><span className="project-avatar">M</span><h3>Markdown 转换</h3><p>Markdown / Word / HTML 转换 · 后续按阶段接入。</p><div className="project-card-foot"><span>规划中</span></div></div>
  <div className="project-card disabled-card"><span className="project-avatar">IP</span><h3>IP 查询</h3><p>公网 IP 与归属地查询 · 后续按阶段接入。</p><div className="project-card-foot"><span>规划中</span></div></div></div>
</PublicShell>}
