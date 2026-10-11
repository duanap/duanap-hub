import { redirect, notFound } from 'next/navigation'
import { hasAdminSession } from './admin-auth'
import { getSiteSettings, getModules, listProjects, getProjectEntries } from './db'
import { listTools } from './tools'
import { listMedia } from './media'
import { listBackups } from './backups'
import { Studio, type StudioView } from '@/components/Studio'
const views = [
  'overview',
  'projects',
  'home',
  'tools',
  'site',
  'seo',
  'games',
  'media',
  'backups',
  'appearance',
  'integrations',
  'analytics',
  'users',
]
export async function renderStudio(parts: string[] = []) {
  if (!(await hasAdminSession())) redirect('/duanap/login')
  const view = (parts[0] || 'overview') as StudioView
  if (!views.includes(view) || parts.length > 2 || (parts.length === 2 && view !== 'projects'))
    notFound()
  let projectId: number | 'new' | undefined
  if (parts[1]) {
    if (parts[1] === 'new') projectId = 'new'
    else {
      const id = Number(parts[1])
      if (!Number.isSafeInteger(id) || id < 1) notFound()
      projectId = id
    }
  }
  const projects = listProjects()
  if (typeof projectId === 'number' && !projects.some((p) => p.id === projectId)) notFound()
  return (
    <Studio
      key={view + '-' + projectId}
      view={view}
      projectId={projectId}
      initialSettings={getSiteSettings()}
      initialModules={getModules()}
      initialProjects={projects}
      initialEntries={projects
        .flatMap((p) => getProjectEntries(p.id))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
      initialTools={listTools()}
      initialMedia={listMedia()}
      initialBackups={view === 'backups' ? await listBackups() : []}
    />
  )
}
