import Link from 'next/link'
import type { Project } from '@/lib/types'
import { STATUS_LABELS } from '@/lib/types'
import { Icon } from './Icon'
export function ProjectCard({ project: p }: { project: Project }) {
  return (
    <Link href={'/projects/' + p.slug} className="work-card">
      <div className="work-image">
        {p.coverUrl ? (
          <img src={p.coverUrl} alt={p.title + ' 项目封面'} loading="lazy" />
        ) : (
          <div className="cover-fallback">
            <Icon name={p.category === 'game' ? 'gamepad' : 'folder'} />
            <span>{p.title.slice(0, 1)}</span>
          </div>
        )}
        <span className={'status status-' + (p.status === 'maintenance' ? 'warning' : p.status)}>
          <i />
          {STATUS_LABELS[p.status]}
        </span>
      </div>
      <div className="work-info">
        <div className="work-title-line">
          <h3>{p.title}</h3>
          <span className="version-tag">{p.version || '版本未填写'}</span>
        </div>
        <p>{p.summary || '查看项目介绍与开发记录。'}</p>
        <div className="work-tags">
          {p.tags.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <div className="work-bottom">
          <small>
            {p.group ||
              { game: '小游戏', website: '网站应用', tool: '开发工具', other: '其他' }[p.category]}
          </small>
          <span>
            查看项目 <Icon name="arrow" />
          </span>
        </div>
      </div>
    </Link>
  )
}
