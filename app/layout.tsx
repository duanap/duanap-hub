import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { SITE_ORIGIN } from '@/lib/config'
import { getSiteSettings } from '@/lib/db'
import { MusicProvider } from '@/components/public/MusicPlayer'
import './globals.css'
import './public-fonts.css'
import './public.css'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export function generateMetadata(): Metadata {
  const s=getSiteSettings()
  return { metadataBase:new URL(SITE_ORIGIN), title:{default:s.seoTitle,template:`%s | ${s.siteName}`},
    description:s.seoDescription,
    robots:s.seoIndexable?{index:true,follow:true}:{index:false,follow:false},
    icons: s.publicIcons.logo ? { icon: s.publicIcons.logo } : undefined,
    alternates:{types:{'application/rss+xml':'/feed.xml'}} }
}
export default function RootLayout({children}:{children:ReactNode}){
  const site = getSiteSettings()
  return <html lang="zh-CN"><body><MusicProvider playlist={site.musicPlaylist.filter(track => track.enabled !== false)} iconUrl={site.publicIcons.music}>{children}</MusicProvider></body></html>
}
