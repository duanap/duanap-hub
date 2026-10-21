'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Markdown } from '@/components/Markdown'
import { ENTRY_LABELS } from '@/lib/types'
import type { getPublicAlbums, getPublicLinks, getPublicNotes } from '@/lib/public-content'
import { HubIcon } from './HubIcon'

export function AlbumGallery({ albums }: { albums: ReturnType<typeof getPublicAlbums> }) {
  const [albumId, setAlbumId] = useState<string | null>(null)
  const [imageIndex, setImageIndex] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const album = albums.find(item => item.id === albumId)
  const images = album?.images || []
  function openImage(index: number) { setImageIndex(index); dialog.current?.showModal() }
  function moveImage(delta: number) { if (images.length) setImageIndex(index => (index + delta + images.length) % images.length) }
  return <>
    {album ? <section aria-label={album.title + '相册'}>
      <div className="hub-album-heading"><button type="button" className="hub-pill-link" onClick={() => setAlbumId(null)}>← 全部相册</button><h2>{album.title}</h2><span>{images.length} 张图片</span>{album.href && <Link href={album.href}>项目详情 ↗</Link>}</div>
      {album.summary && <p className="hub-album-summary">{album.summary}</p>}
      <div className="hub-image-grid">{images.map((image, index) => <button type="button" key={image.url} aria-label={'查看图片 ' + (index + 1)} onClick={() => openImage(index)}><img src={image.url} alt={image.caption || album.title + ' 图片 ' + (index + 1)} loading="lazy" />{image.caption && <span className="hub-image-caption">{image.caption}</span>}</button>)}</div>
    </section> : <div className="hub-album-grid">{albums.map(item => <button className="hub-album-cover" type="button" key={item.id} onClick={() => setAlbumId(item.id)} aria-label={'打开相册：' + item.title}>
      <span className="hub-polaroids">{[item.coverUrl, ...item.images.map(image => image.url), item.coverUrl, item.coverUrl].slice(0, 4).map((url, index) => <span key={index} style={{ rotate: [-11, -4, 5, 12][index] + 'deg' }}><img src={url} alt={index === 0 ? item.title + '封面' : ''} loading="lazy" /></span>)}</span><span className="hub-album-label">{item.title} <small>{item.images.length}</small></span>
    </button>)}</div>}
    <dialog className="hub-lightbox" ref={dialog} aria-label="图片预览" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }} onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); moveImage(-1) } if (event.key === 'ArrowRight') { event.preventDefault(); moveImage(1) } }}>
      <button className="hub-lightbox-close" type="button" aria-label="关闭图片预览" onClick={() => dialog.current?.close()}><HubIcon name="close" /></button>
      <button className="hub-lightbox-prev" type="button" aria-label="上一张图片" onClick={() => moveImage(-1)}>‹</button>
      {images[imageIndex] && <img src={images[imageIndex].url} alt={images[imageIndex].caption || (album?.title || '') + ' 图片 ' + (imageIndex + 1)} />}
      <button className="hub-lightbox-next" type="button" aria-label="下一张图片" onClick={() => moveImage(1)}>›</button><p className="hub-lightbox-caption">{images[imageIndex]?.caption}</p><span className="hub-lightbox-counter">{imageIndex + 1} / {images.length}</span>
    </dialog>
  </>
}

export function NotesFeed({ notes }: { notes: ReturnType<typeof getPublicNotes> }) {
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<string[] | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [page, setPage] = useState(0)
  useEffect(() => {
    const id = window.location.hash.slice(1), index = notes.findIndex(note => note.id === id)
    if (index >= 0) setPage(Math.floor(index / 18))
  }, [notes])
  useEffect(() => {
    if (window.location.hash) { const target = document.getElementById(window.location.hash.slice(1)); target?.scrollIntoView() }
  }, [page])
  const ordered = order ? [...notes].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : notes
  const filtered = ordered.filter(note => `${note.title} ${note.body} ${note.projectTitle}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const visible = filtered.slice(page * 18, (page + 1) * 18)
  function randomize() {
    const ids = notes.map(note => note.id)
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]] }
    setOrder(ids); setPage(0)
  }
  return <>
    <div className="hub-content-toolbar"><div className="hub-segmented"><button type="button" aria-pressed={!order} onClick={() => { setOrder(null); setPage(0) }}>按时间</button><button type="button" aria-pressed={!!order} onClick={randomize}>随机看看</button></div><label className="hub-search"><HubIcon name="search" /><input type="search" aria-label="搜索动态" placeholder="Search notes…" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} /></label></div>
    {visible.length ? <div className="hub-notes-columns">{visible.map(note => <article className="hub-card hub-note" key={note.id} id={note.id} data-note-id={note.id}>
      {note.imageUrl && <img className="hub-note-image" src={note.imageUrl} alt={note.title + '配图'} loading="lazy" />}<small className="hub-note-type">{note.type === 'note' ? '个人随记' : ENTRY_LABELS[note.type]}</small><h2>{note.title}</h2><div className={'markdown hub-note-body' + (!expanded.includes(note.id) ? ' hub-note-clamped' : '')}><Markdown>{note.body}</Markdown></div>
      {note.body.length > 140 && <button className="hub-expand" type="button" aria-expanded={expanded.includes(note.id)} onClick={() => setExpanded(expanded.includes(note.id) ? expanded.filter(id => id !== note.id) : [...expanded, note.id])}>{expanded.includes(note.id) ? '收起' : '展开'}</button>}
      <div className="hub-note-footer"><time dateTime={note.date || undefined}>{note.date?.slice(0, 10)}</time><Link href={note.href}>{note.projectTitle} ↗</Link></div>
    </article>)}</div> : <div className="hub-empty" role="status">没有找到匹配的动态。</div>}
    {filtered.length > 18 && <nav className="hub-pagination" aria-label="动态分页"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>← 上一页</button><span>{page + 1} / {Math.ceil(filtered.length / 18)}</span><button type="button" disabled={(page + 1) * 18 >= filtered.length} onClick={() => setPage(page + 1)}>下一页 →</button></nav>}
  </>
}

export function LinksDirectory({ links }: { links: ReturnType<typeof getPublicLinks> }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('全部')
  const groups = ['全部', ...new Set(links.map(link => link.group))]
  const filtered = links.filter(link => (group === '全部' || link.group === group) && `${link.title} ${link.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <>
    <div className="hub-content-toolbar"><div className="hub-segmented">{groups.map(name => <button type="button" key={name} aria-pressed={name === group} onClick={() => setGroup(name)}>{name}</button>)}</div><label className="hub-search"><HubIcon name="search" /><input type="search" aria-label="搜索公开链接" placeholder="Search links…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    <div className="hub-links-grid">{filtered.map((link, index) => {
      const content = <><span className="hub-link-initial" aria-hidden="true">{link.iconUrl ? <img src={link.iconUrl} alt="" loading="lazy" /> : link.title.slice(0, 1)}</span><span className="hub-link-copy"><strong>{link.title}</strong><small>{link.summary || link.group}</small></span><HubIcon name="arrow" /></>
      return link.url.startsWith('/') ? <Link href={link.url} className="hub-card hub-directory-link" key={index}>{content}</Link> : <a href={link.url} className="hub-card hub-directory-link" key={index} target="_blank" rel="noopener noreferrer">{content}</a>
    })}</div>
    {!filtered.length && <div className="hub-empty" role="status">没有找到匹配的链接。</div>}
  </>
}
