import Link from 'next/link'
import { STATUS_LABELS } from '@/lib/types'
import type { Project } from '@/lib/types'

export function ProjectCard({ project }: { project: Project }) {
  return <Link href={`/projects/${project.slug}`} className="project-card">
    <div className="project-card-top"><span className="project-avatar" aria-hidden="true">{project.title.slice(0,1)}</span><span className={`project-state status-${project.status}`}>{STATUS_LABELS[project.status]}</span></div>
    <h3>{project.title}</h3>
    <p>{project.summary||'查看项目详情与近期动态'}</p>
    <div className="project-card-foot"><span>{project.version||'版本未填写'}</span><span>查看详情 ↗</span></div>
  </Link>
}
