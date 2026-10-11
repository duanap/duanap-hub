import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { Hero } from '@/components/Hero'
import { ProjectCatalog } from '@/components/ProjectCatalog'
import { getSiteSettings, isEnabled, listProjects } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
export function generateMetadata() {
  return pageMetadata(
    '小游戏',
    '和朋友一起，让平凡的日子多一点快乐。',
    '/games',
    isEnabled('games'),
  )
}
export default function GamesPage() {
  if (!isEnabled('games')) notFound()
  return (
    <PublicShell>
      <Hero
        site={getSiteSettings()}
        kind="games"
        title="一起玩点"
        accent="有趣的。"
        description="和朋友一起，让平凡的日子多一点快乐。"
      />
      <ProjectCatalog games items={listProjects({ publishedOnly: true, category: 'game' })} />
      <div className="container pending-note">统一账号和小游戏战绩属于后续阶段，目前待完善。</div>
    </PublicShell>
  )
}
