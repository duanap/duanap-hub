'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '@/components/Markdown'
import type { getPublicNotes } from '@/lib/public-content'
import { HubIcon } from './HubIcon'

type Note = ReturnType<typeof getPublicNotes>[number]
const PAGE_SIZE = 18

function NoteCard({ note, onExpand }: { note: Note; onExpand: (note: Note) => void }) {
  const content = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    const element = content.current
    if (!element) return
    let active = true
    const measure = () => { if (active) setOverflow(element.getBoundingClientRect().height > parseFloat(getComputedStyle(element).lineHeight) * 4 + 1) }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    void document.fonts.ready.then(measure)
    measure()
    return () => { active = false; observer.disconnect() }
  }, [note.body])
  return <article className="hub-card hub-note" id={note.id} data-note-id={note.id}>
    {note.imageUrl && <button type="button" className="hub-note-photo" aria-label="查看文案配图" onClick={() => onExpand(note)}><img className="hub-note-image" src={note.imageUrl} alt={note.title ? note.title + '配图' : '文案配图'} loading="lazy" /></button>}
    {note.title && <h2 title={note.title}>{note.title}</h2>}
    <div className="hub-note-preview"><div className="markdown hub-note-body" ref={content}><Markdown>{note.body}</Markdown></div></div>
    <div className="hub-note-expand-slot">{overflow && <button className="hub-expand" type="button" aria-haspopup="dialog" onClick={() => onExpand(note)}>展开</button>}</div>
    <div className="hub-note-footer"><time dateTime={note.date}>{note.date.slice(5, 10)}</time><Link href={note.href}>{note.author}</Link></div>
  </article>
}

export function NotesFeed({ notes }: { notes: Note[] }) {
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<string[] | null>(null)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Note | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const id = window.location.hash.slice(1), index = notes.findIndex(note => note.id === id)
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE))
  }, [notes])
  useEffect(() => {
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView()
  }, [page])
  useEffect(() => { if (selected) dialog.current?.showModal() }, [selected])
  const positions = order ? new Map(order.map((id, index) => [id, index])) : null
  const ordered = positions ? [...notes].sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)) : notes
  const filtered = ordered.filter(note => `${note.title} ${note.body} ${note.author}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  function randomize() {
    const ids = notes.map(note => note.id)
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
    setOrder(ids); setPage(0)
  }
  return <>
    <div className="hub-content-toolbar"><div className="hub-segmented"><button type="button" aria-pressed={!order} onClick={() => { setOrder(null); setPage(0) }}>按时间</button><button type="button" aria-pressed={!!order} onClick={randomize}>随机看看</button></div><label className="hub-search"><HubIcon name="search" /><input type="search" aria-label="搜索文案" placeholder="Search notes…" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></label></div>
    {visible.length ? <div className="hub-notes-columns">{visible.map(note => <NoteCard key={note.id} note={note} onExpand={setSelected} />)}</div> : <div className="hub-empty" role="status">没有找到匹配的文案。</div>}
    {filtered.length > PAGE_SIZE && <nav className="hub-pagination" aria-label="文案分页"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>← 上一页</button><span>{page + 1} / {Math.ceil(filtered.length / PAGE_SIZE)}</span><button type="button" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage(page + 1)}>下一页 →</button></nav>}
    <dialog className="hub-note-dialog" ref={dialog} aria-label="文案全文" onClose={() => setSelected(null)} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <div className="hub-note-dialog-toolbar"><button type="button" className="hub-note-close" aria-label="关闭文案全文" onClick={() => dialog.current?.close()}><HubIcon name="close" /></button></div>
      {selected && <article>{selected.imageUrl && <img className="hub-note-full-image" src={selected.imageUrl} alt={selected.title ? selected.title + '配图' : '文案配图'} />}{selected.title && <h2>{selected.title}</h2>}<div className="markdown hub-note-full-body"><Markdown>{selected.body}</Markdown></div><div className="hub-note-footer"><time dateTime={selected.date}>{selected.date.slice(0, 10)}</time><span>{selected.author}</span></div></article>}
    </dialog>
  </>
}
