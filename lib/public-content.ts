import { getSiteSettings, isEnabled, listProjects, recentPublicEntries } from '@/lib/db'
import { listAlbums, listFriendLinks, listPersonalNotes } from '@/lib/content'
import type { AlbumImage, EntryType } from '@/lib/types'

type PublicAlbum = { id: string; title: string; summary: string; coverUrl: string; images: AlbumImage[]; href: string }
type PublicNote = { id: string; title: string; body: string; type: EntryType | 'note'; date: string | null; projectTitle: string; href: string; imageUrl: string; sortOrder: number }

export function getPublicAlbums(): PublicAlbum[] {
  const independent = listAlbums(true).map(album => {
    const images = [...album.images]
    if (album.coverUrl && !images.some(image => image.url === album.coverUrl)) images.unshift({ url: album.coverUrl, caption: '' })
    return { id: 'album-' + album.id, title: album.title, summary: album.summary, coverUrl: album.coverUrl || images[0]?.url || '', images, href: '' }
  }).filter(album => album.images.length)
  const projects = isEnabled('projects') ? listProjects({ publishedOnly: true, limit: 1000 }).flatMap(project => {
    const images = [...new Set([project.coverUrl, ...project.screenshots].filter(Boolean))].map(url => ({ url, caption: '' }))
    return images.length ? [{ id: 'project-' + project.id, title: project.title, summary: project.summary, coverUrl: project.coverUrl || images[0].url, images, href: '/projects/' + project.slug }] : []
  }) : []
  return [...independent, ...projects]
}

export function getPublicNotes(): PublicNote[] {
  const site = getSiteSettings()
  const independent: PublicNote[] = listPersonalNotes(true).map(note => ({ id: 'note-' + note.id, title: note.title, body: note.body, type: 'note', date: note.publishedAt, projectTitle: site.displayName, href: '/notes#note-' + note.id, imageUrl: note.imageUrl, sortOrder: note.sortOrder }))
  const projects: PublicNote[] = isEnabled('projects') ? recentPublicEntries(100).map(entry => ({
    id: 'entry-' + entry.id, title: entry.title, body: entry.body, type: entry.type,
    date: entry.publishedAt, projectTitle: entry.projectTitle, href: `/projects/${entry.projectSlug}#update-${entry.id}`, imageUrl: '', sortOrder: 0,
  })) : []
  return [...independent, ...projects].sort((a, b) => a.sortOrder - b.sortOrder || (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id))
}

export function getPublicLinks() {
  const site = getSiteSettings()
  const profiles = [
    ...(site.githubUrl ? [{ title: 'GitHub', url: site.githubUrl, summary: site.displayName + ' 的代码与开源项目', group: '社交', iconUrl: '' }] : []),
    ...(site.blogUrl && isEnabled('blog') ? [{ title: 'Blog', url: site.blogUrl, summary: site.displayName + ' 的独立博客', group: '博客', iconUrl: '' }] : []),
    ...site.socialLinks.map(link => ({ title: link.label, url: link.url, summary: site.displayName + ' 的公开社交入口', group: '社交', iconUrl: '' })),
  ]
  const projects = isEnabled('projects') ? listProjects({ publishedOnly: true, limit: 1000 }).map(project => ({
    title: project.title, url: '/projects/' + project.slug, summary: project.summary, group: '项目', iconUrl: project.iconUrl,
  })) : []
  const friends = listFriendLinks(true).map(link => ({ title: link.title, url: link.url, summary: link.summary, group: link.groupName || '朋友', iconUrl: link.iconUrl }))
  return [...friends, ...profiles, ...projects]
}
