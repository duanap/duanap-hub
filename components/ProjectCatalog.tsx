'use client'
import { useState } from 'react'
import type { Project } from '@/lib/types'
import { ProjectCard } from './ProjectCard'
import { Icon } from './Icon'
export function ProjectCatalog({ items, games = false }: { items: Project[]; games?: boolean }) {
  const [q, setQ] = useState(''),
    [type, setType] = useState('all')
  const groups = games
    ? Array.from(new Set(items.map((x) => x.group).filter(Boolean)))
    : ['website', 'game', 'tool', 'other']
  const labels: Record<string, string> = {
    website: '网站应用',
    game: '小游戏',
    tool: '开发工具',
    other: '其他',
  }
  const visible = items.filter(
    (p) =>
      (type === 'all' || (games ? p.group === type : p.category === type)) &&
      [p.title, p.summary, ...p.tags].join(' ').toLowerCase().includes(q.toLowerCase()),
  )
  return (
    <div className="container catalog-page">
      <div className="filter-bar">
        <div className="filter-tabs" aria-label="分类筛选">
          {['all', ...groups].map((x) => (
            <button
              key={x}
              className={type === x ? 'active' : ''}
              onClick={() => setType(x)}
              aria-pressed={type === x}
            >
              {x === 'all' ? '全部作品' : labels[x] || x}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Icon name="search" />
          <input
            aria-label="搜索项目"
            placeholder="搜索作品、标签…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>
      {visible.length ? (
        <div className="works-grid">
          {visible.map((p) => (
            <ProjectCard project={p} key={p.id} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Icon name="folder" />
          <h2>{items.length ? '没有匹配的作品' : '作品还在整理中。'}</h2>
          <p>{items.length ? '试试其他关键词或分类。' : '发布后的项目会出现在这里。'}</p>
        </div>
      )}
    </div>
  )
}
