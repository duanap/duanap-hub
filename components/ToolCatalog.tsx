'use client'
import Link from 'next/link'
import { useState } from 'react'
import type { ToolState } from '@/lib/tools'
import { Icon } from './Icon'
export function ToolCatalog({ items }: { items: ToolState[] }) {
  const [q, setQ] = useState(''),
    [group, setGroup] = useState('全部工具')
  const groups = ['全部工具', ...Array.from(new Set(items.map((t) => t.group)))],
    filtered = items.filter(
      (t) =>
        (group === '全部工具' || t.group === group) &&
        (t.title + t.summary).toLowerCase().includes(q.toLowerCase()),
    )
  return (
    <div className="container catalog-page">
      <div className="filter-bar">
        <div className="filter-tabs">
          {groups.map((g) => (
            <button key={g} onClick={() => setGroup(g)} className={g === group ? 'active' : ''}>
              {g}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Icon name="search" />
          <input
            aria-label="搜索工具"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索工具…"
          />
        </label>
      </div>
      <div className="tools-list">
        {filtered.map((t) => (
          <Link className="tool-card" key={t.id} href={'/tools/' + t.id}>
            <span className={'tool-icon ' + t.color}>
              <Icon name={t.icon} />
            </span>
            <h3>{t.title}</h3>
            <p>{t.summary}</p>
            <div className="tool-card-foot">
              <span>{t.group}</span>
              <Icon name="arrow" />
            </div>
          </Link>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <h2>暂时没有可用工具。</h2>
          <p>试试其他关键词，或等待管理员启用。</p>
        </div>
      )}
      <p className="pending-note">
        Word 转换与外部 IP 归属地查询待完善；当前工具全部在浏览器本地处理。
      </p>
    </div>
  )
}
