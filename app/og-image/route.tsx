import { ImageResponse } from 'next/og'
import { getSiteSettings } from '@/lib/db'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  const site = getSiteSettings()
  // Default share art uses ASCII branding so rendering never needs remote glyph fonts.
  const displayName = site.displayName.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 14) || 'duanap Hub'
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 90, background: '#f7f8fa', color: '#20252c' }}>
    <div style={{ fontSize: 26, letterSpacing: 5, color: '#3167cf', marginBottom: 36 }}>DUANAP HUB</div>
    <div style={{ display: 'flex', fontSize: 72, fontWeight: 700 }}>{displayName}</div>
    <div style={{ fontSize: 28, marginTop: 36, color: '#6e7582' }}>Projects / Games / Tools</div>
  </div>, { width: 1200, height: 630 })
}
