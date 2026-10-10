import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { ProjectCard } from '@/components/ProjectCard'
import { isEnabled, listProjects } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata():Metadata{return pageMetadata('项目与作品','浏览 duanap 的个人作品、开发项目、版本更新及维护公告。','/projects',isEnabled('projects'))}
export default function ProjectsPage(){
  if(!isEnabled('projects'))notFound()
  const items=listProjects({publishedOnly:true})
  return <PublicShell><div className="page-heading"><span className="eyebrow">MY WORK</span><h1>项目与作品</h1><p>一些正在维护或持续开发的项目。</p></div>
    {items.length?<div className="project-grid">{items.map(p=><ProjectCard key={p.id} project={p}/>)}</div>:<div className="soft-placeholder">尚未发布项目。</div>}
  </PublicShell>
}
