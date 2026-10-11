import { renderStudio } from '@/lib/studio-page'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'duanap Studio', robots: { index: false, follow: false } }
export default function StudioPage() {
  return renderStudio()
}
