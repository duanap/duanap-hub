import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { getSiteSettings } from '@/lib/db'
import { qqLoginDestination } from '@/lib/qq-login'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'QQ登录', robots: { index: false, follow: false } }

export default function QQLoginPage() {
  const destination = qqLoginDestination()
  if (destination) redirect(destination)
  const site = getSiteSettings()
  return <PublicShell>
    <section className="page-heading"><span className="eyebrow">QQ LOGIN</span><h1>QQ登录暂未开通</h1><p>登录服务正在准备中，暂时无法使用 QQ 登录。</p></section>
    <section className="content-card qq-login-notice"><p>你仍可直接浏览本站公开内容。登录开放后，将通过腾讯官方授权页面完成验证，本站不会收集你的 QQ 密码。</p>
      <div className="hero-actions"><Link className="action-primary" href="/">返回首页</Link>{site.publicEmail && <a className="action-secondary" href={'mailto:' + site.publicEmail}>联系站长</a>}</div>
    </section>
  </PublicShell>
}
