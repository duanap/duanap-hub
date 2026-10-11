import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { Hero } from '@/components/Hero'
import { ProjectCatalog } from '@/components/ProjectCatalog'
import { getSiteSettings, isEnabled, listProjects } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
export function generateMetadata() {
  return pageMetadata(
    '项目与作品',
    '从有趣的想法，到真正可以体验的作品。',
    '/projects',
    isEnabled('projects'),
  )
}
export default function ProjectsPage() {
  if (!isEnabled('projects')) notFound()
  return (
    <PublicShell>
      <Hero
        site={getSiteSettings()}
        kind="projects"
        title="一些认真做过的"
        accent="小东西。"
        description="从有趣的想法，到真正可以体验的作品。"
      />
      <ProjectCatalog items={listProjects({ publishedOnly: true })} />
    </PublicShell>
  )
}
