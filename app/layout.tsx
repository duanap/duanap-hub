import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SITE_ORIGIN } from '@/lib/config'
import { getSiteSettings } from '@/lib/db'
import './globals.css'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export function generateMetadata(): Metadata {
  const s=getSiteSettings()
  return { metadataBase:new URL(SITE_ORIGIN), title:{default:s.seoTitle,template:`%s | ${s.siteName}`},
    description:s.seoDescription,
    robots:s.seoIndexable?{index:true,follow:true}:{index:false,follow:false},
    alternates:{types:{'application/rss+xml':'/feed.xml'}} }
}
export default function RootLayout({children}:{children:ReactNode}){
  return <html lang="zh-CN"><body>{children}</body></html>
}
