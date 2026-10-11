import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SITE_ORIGIN } from '@/lib/config'
import { getSiteSettings } from '@/lib/db'
import './globals.css'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function generateMetadata(): Metadata {
  const s = getSiteSettings()
  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: { default: s.seoTitle, template: `%s | ${s.siteName}` },
    description: s.seoDescription,
    robots: s.seoIndexable ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { types: { 'application/rss+xml': '/feed.xml' } },
  }
}
export default function RootLayout({ children }: { children: ReactNode }) {
  const site = getSiteSettings()
  return (
    <html
      lang="zh-CN"
      data-scroll-behavior="smooth"
      data-theme={site.defaultTheme === 'dark' ? 'dark' : 'light'}
      data-default-theme={site.defaultTheme}
      suppressHydrationWarning
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('hub-theme')||document.documentElement.dataset.defaultTheme;if(t==='system')t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  )
}
