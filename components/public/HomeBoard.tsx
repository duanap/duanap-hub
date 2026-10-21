import Link from 'next/link'
import { cloneElement, type CSSProperties, type ReactElement } from 'react'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { HubIcon } from './HubIcon'
import { LiveClock, ThemeOrb } from './PublicWidgets'
import { MusicTile } from './MusicPlayer'
import { getPublicAlbums } from '@/lib/public-content'
import { DEFAULT_HOME_WIDGETS } from '@/lib/home-config'
import type { HomeWidgetId } from '@/lib/types'

export function HomeBoard() {
  const site = getSiteSettings()
  const tags = site.homeTags
  const showPhotos = isEnabled('photos'), showNotes = isEnabled('notes')
  const images = showPhotos ? (site.homePhotosSource === 'custom' ? site.homePhotoUrls : getPublicAlbums().flatMap(album => album.images.map(image => image.url))).slice(0, 24) : []
  const tiles: Record<HomeWidgetId, ReactElement<{ style?: CSSProperties; 'data-widget'?: string }>> = {
    intro: <section className="hub-tile hub-intro hero" aria-label="个人介绍">
      <div className="hub-intro-copy"><h1>{site.homeGreeting} <span>{site.displayName}</span>.</h1><p>{site.tagline}</p><p className="hub-intro-bio">{site.biography.replace(/[#*`>\[\]]/g, '').slice(0, 230)}</p>
        <div className="hub-intro-actions">{site.githubUrl && <a className="hub-round-link" href={site.githubUrl} target="_blank" rel="noopener noreferrer" aria-label="GitHub"><HubIcon name="code" src={site.publicIcons.code} /></a>}{site.publicEmail && <a className="hub-round-link" href={'mailto:' + site.publicEmail} aria-label="公开邮箱"><HubIcon name="mail" src={site.publicIcons.mail} /></a>}{site.socialLinks.map((link, index) => <a className="hub-social-chip" href={link.url} key={index} target="_blank" rel="noopener noreferrer">{link.iconUrl && <HubIcon name="links" src={link.iconUrl} />}{link.label}</a>)}{isEnabled('about') && <Link className="hub-pill-link" href="/about">About <HubIcon name="about" src={site.publicIcons.about} /></Link>}</div>
      </div>{site.avatarUrl ? <img className="hub-intro-avatar" src={site.avatarUrl} alt={site.displayName + '头像'} /> : <div className="hub-robot" role="img" aria-label="正在散步的小机器人" />}
    </section>,
    clock: <section className="hub-tile hub-clock-tile"><LiveClock /></section>,
    garden: <section className="hub-tile hub-garden" aria-label="小花园"><span className="hub-pixel-sprout" aria-hidden="true"><i /></span><small>{site.homeGardenText}</small></section>,
    photos: <section className="hub-tile hub-photo-tile">{showPhotos ? <Link href="/photos" aria-label="查看相册"><div className="hub-photo-strip">{images.length ? [...images, ...images].map((url, index) => <img src={url} key={index} alt="" loading="lazy" />) : <div className="hub-photo-empty"><HubIcon name="photos" src={site.publicIcons.photos} /><span>Keep a moment.</span></div>}</div><span className="hub-photo-caption">Photos <HubIcon name="arrow" /></span></Link> : <div className="hub-photo-empty"><HubIcon name="photos" src={site.publicIcons.photos} /><span>Keep a moment.</span></div>}</section>,
    tags: <section className="hub-tile hub-tags-tile" aria-label="兴趣标签"><div className="hub-tag-cloud">{tags.map(tag => <span key={tag}>{tag}</span>)}</div></section>,
    globe: <section className="hub-tile hub-globe-tile"><ThemeOrb /></section>,
    console: <section className="hub-tile hub-console"><div className="hub-console-dots" aria-hidden="true"><i /><i /><i /></div>{site.homeConsole ? <p className="hub-console-text">{site.homeConsole}</p> : <p><b>$</b> whoami<br />{site.displayName}<br /><br /><b>$</b> echo &quot;hello, world&quot;<span className="hub-cursor" aria-hidden="true" /></p>}</section>,
    blog: <section className="hub-tile hub-blog-tile">{isEnabled('blog') ? <Link href="/blog"><strong>Blog</strong><HubIcon name="arrow" /></Link> : <span className="hub-quiet-label">Build slowly.</span>}</section>,
    notes: <section className="hub-tile hub-notes-tile">{showNotes ? <Link href="/notes"><strong>Notes</strong><HubIcon name="arrow" /></Link> : <span className="hub-quiet-label">Small moments.</span>}</section>,
    quote: <section className="hub-tile hub-quote-tile"><blockquote>“{site.homeQuote || site.tagline}”</blockquote><small>— {site.homeQuoteAuthor || site.displayName}</small></section>,
    music: <section className="hub-tile hub-music-tile"><MusicTile /></section>,
    info: <section className="hub-tile hub-info-tile"><span>© {new Date().getFullYear()} {site.copyright || site.displayName}</span><a href="/feed.xml" aria-label="RSS 订阅"><HubIcon name="rss" src={site.publicIcons.rss} /></a></section>,
    reading: <section className="hub-tile hub-reading-tile"><small>{site.homeReadingLabel}</small>{site.homeReadingUrl ? <a href={site.homeReadingUrl}><strong>{site.homeReadingText}</strong></a> : <strong>{site.homeReadingText}</strong>}</section>,
  }
  const custom = JSON.stringify(site.homeWidgets) !== JSON.stringify(DEFAULT_HOME_WIDGETS)
  const spans: Record<HomeWidgetId, number> = { intro: 8, clock: 4, garden: 4, photos: 4, tags: 8, globe: 4, console: 4, blog: 4, notes: 4, quote: 4, music: 8, info: 4, reading: 4 }
  return <div className={'hub-board' + (custom ? ' hub-board-custom' : '')} aria-label="个人主页卡片">
    {site.homeWidgets.filter(widget => widget.enabled).map(widget => cloneElement(tiles[widget.id], { key: widget.id, 'data-widget': widget.id, style: { '--widget-span': widget.width === 'auto' ? spans[widget.id] : { small: 4, wide: 8, full: 12 }[widget.width] } as CSSProperties }))}
  </div>
}
