import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { NotesFeed } from '@/components/public/ContentViews'
import { isEnabled } from '@/lib/db'
import { getPublicNotes } from '@/lib/public-content'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  return pageMetadata('随记与动态', '个人随记、项目更新与接下来的计划。', '/notes', isEnabled('notes') && getPublicNotes().length > 0)
}
export default function NotesPage() {
  if (!isEnabled('notes')) notFound()
  const notes = getPublicNotes()
  return <PublicShell><header className="hub-page-heading"><h1>Notes</h1><p>生活片段与开发记录 · {notes.length} 条公开动态</p></header>{notes.length ? <NotesFeed notes={notes} /> : <div className="hub-empty"><h2>暂时没有公开动态</h2><p>已发布且生效的个人随记、项目更新与公告会出现在这里。</p></div>}</PublicShell>
}
