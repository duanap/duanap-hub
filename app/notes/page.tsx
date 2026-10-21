import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { NotesFeed } from '@/components/public/ContentViews'
import { isEnabled } from '@/lib/db'
import { getPublicNotes } from '@/lib/public-content'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  return pageMetadata('朋友圈文案', '随手写下的心情、想法和生活片段。', '/notes', isEnabled('notes') && getPublicNotes().length > 0)
}
export default function NotesPage() {
  if (!isEnabled('notes')) notFound()
  const notes = getPublicNotes()
  return <PublicShell><header className="hub-page-heading"><h1>Notes</h1><p>心情、碎碎念与生活片段 · {notes.length} 条文案</p></header>{notes.length ? <NotesFeed notes={notes} /> : <div className="hub-empty"><h2>暂时还没有文案</h2><p>一句话，也值得留下。</p></div>}</PublicShell>
}
