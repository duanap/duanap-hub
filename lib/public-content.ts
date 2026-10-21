import { getSiteSettings } from '@/lib/db'
import { listAlbums, listFriendLinks, listPersonalNotes } from '@/lib/managed-content'
import type { AlbumImage } from '@/lib/types'

type PublicAlbum = { id: string; title: string; summary: string; coverUrl: string; images: AlbumImage[] }
type PublicNote = { id: string; title: string; body: string; date: string; author: string; href: string; imageUrl: string; sortOrder: number }

export function getPublicAlbums(): PublicAlbum[] {
  return listAlbums(true).map(album => {
    const images = [...album.images]
    return { id: 'album-' + album.id, title: album.title, summary: album.summary, coverUrl: album.coverUrl || images[0]?.url || '', images }
  }).filter(album => album.images.length)
}

export function getPublicNotes(): PublicNote[] {
  const site = getSiteSettings()
  return listPersonalNotes(true).map(note => ({ id: 'note-' + note.id, title: note.title, body: note.body, date: note.publishedAt, author: site.displayName, href: '/notes#note-' + note.id, imageUrl: note.imageUrl, sortOrder: note.sortOrder }))
}

export function getPublicLinks() {
  return listFriendLinks(true).map(link => ({ title: link.title, url: link.url, summary: link.summary, group: link.groupName || '朋友', iconUrl: link.iconUrl }))
}
