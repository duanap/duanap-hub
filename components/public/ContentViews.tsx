'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Markdown } from '@/components/Markdown'
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
      <div className="hub-album-heading"><button type="button" className="hub-pill-link" onClick={() => setAlbumId(null)}>← 全部相册</button><h2>{album.title}</h2><span>{images.length} 张照片</span></div>
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

export { NotesFeed } from './NotesFeed'

function LinkIcon({ title, url }: { title: string; url: string }) {
  const [failed, setFailed] = useState(false)
  return <span className="hub-link-initial" aria-hidden="true">{url && !failed ? <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} /> : title.slice(0, 1)}</span>
}

export function LinksDirectory({ links }: { links: ReturnType<typeof getPublicLinks> }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('全部')
  const groups = ['全部', ...new Set(links.map(link => link.group))]
  const filtered = links.filter(link => (group === '全部' || link.group === group) && `${link.title} ${link.summary}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <>
    <div className="hub-content-toolbar"><div className="hub-segmented">{groups.map(name => <button type="button" key={name} aria-pressed={name === group} onClick={() => setGroup(name)}>{name}</button>)}</div><label className="hub-search"><HubIcon name="search" /><input type="search" aria-label="搜索公开链接" placeholder="Search links…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    <div className="hub-links-grid">{filtered.map((link, index) => {
      const content = <><LinkIcon key={link.iconUrl} title={link.title} url={link.iconUrl} /><span className="hub-link-copy"><strong>{link.title}</strong><small>{link.summary || link.group}</small></span><HubIcon name="arrow" /></>
      return link.url.startsWith('/') ? <Link href={link.url} className="hub-card hub-directory-link" key={index}>{content}</Link> : <a href={link.url} className="hub-card hub-directory-link" key={index} target="_blank" rel="noopener noreferrer">{content}</a>
    })}</div>
    {!filtered.length && <div className="hub-empty" role="status">没有找到匹配的链接。</div>}
  </>
}
