'use client'
import Link from 'next/link'
import { businessDay } from '@/lib/dates'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { HubSettings, ModuleState, Project, ProjectEntry } from '@/lib/types'
import { STATUS_LABELS } from '@/lib/types'
import type { ToolState } from '@/lib/tools'
import type { MediaItem } from '@/lib/media'
import type { BackupInfo } from '@/lib/backups'
import { Icon, type IconName } from './Icon'
import { ThemeToggle } from './ThemeToggle'
import { ProjectEditor } from './studio/ProjectEditor'
import { SiteEditor } from './studio/SiteEditor'
import { ModuleEditor } from './studio/ModuleEditor'
import { ToolsEditor } from './studio/ToolsEditor'
import { MediaPanel, BackupsPanel } from './studio/OperationsPanels'
import { studioApi } from './studio/client'
export type StudioView =
  | 'overview'
  | 'projects'
  | 'home'
  | 'tools'
  | 'site'
  | 'seo'
  | 'games'
  | 'media'
  | 'backups'
  | 'appearance'
  | 'integrations'
  | 'analytics'
  | 'users'
const nav: { id: StudioView; label: string; icon: IconName; group: string }[] = [
  { id: 'overview', label: '工作台', icon: 'home', group: '工作台' },
  { id: 'projects', label: '项目与作品', icon: 'folder', group: '内容管理' },
  { id: 'home', label: '首页编排', icon: 'grid', group: '内容管理' },
  { id: 'tools', label: '工具管理', icon: 'code', group: '内容管理' },
  { id: 'games', label: '游戏展示', icon: 'gamepad', group: '内容管理' },
  { id: 'seo', label: '搜索优化', icon: 'search', group: '数据与运营' },
  { id: 'analytics', label: '访问统计', icon: 'chart', group: '数据与运营' },
  { id: 'media', label: '媒体素材', icon: 'image', group: '系统管理' },
  { id: 'site', label: '站点与备案', icon: 'settings', group: '系统管理' },
  { id: 'appearance', label: '外观主题', icon: 'sun', group: '系统管理' },
  { id: 'backups', label: '备份与恢复', icon: 'download', group: '系统管理' },
  { id: 'integrations', label: '外部集成', icon: 'grid', group: '系统管理' },
  { id: 'users', label: '统一用户', icon: 'user', group: '后续阶段' },
]
export const STUDIO_VIEWS = nav.map((x) => x.id)
const href = (id: StudioView) => (id === 'overview' ? '/duanap' : '/duanap/' + id)
type Props = {
  initialSettings: HubSettings
  initialModules: ModuleState[]
  initialProjects: Project[]
  initialEntries: ProjectEntry[]
  initialTools: ToolState[]
  initialMedia: MediaItem[]
  initialBackups: Omit<BackupInfo, 'directory'>[]
  view: StudioView
  projectId?: number | 'new'
}
export function Studio({
  initialSettings,
  initialModules,
  initialProjects,
  initialEntries,
  initialTools,
  initialMedia,
  initialBackups,
  view,
  projectId,
}: Props) {
  const router = useRouter(),
    [projects, setProjects] = useState(initialProjects),
    [dirty, setDirty] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [more, setMore] = useState(false),
    [q, setQ] = useState(''),
    [filter, setFilter] = useState('all'),
    [error, setError] = useState(''),
    dialog = useRef<HTMLDivElement>(null),
    moreButton = useRef<HTMLButtonElement>(null)
  const onDirty = useCallback((v: boolean) => setDirty(v), [])
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  function allow() {
    return !dirty || confirm('有未保存的修改，确认离开当前编辑页？')
  }
  function navigate(path: string) {
    if (!allow()) return
    setMore(false)
    router.push(path)
  }
  useEffect(() => {
    if (!more) return
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => moreButton.current?.focus()
  }, [more])
  function drawerKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setMore(false)
      return
    }
    if (e.key === 'Tab') {
      const nodes = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>('button,a[href]') || [],
      )
      if (!nodes.length) return
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault()
        nodes.at(-1)?.focus()
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault()
        nodes[0].focus()
      }
    }
  }
  async function logout() {
    if (!allow()) return
    try {
      await studioApi('/api/studio/logout', 'POST')
      window.location.assign('/duanap/login')
    } catch (e) {
      setError(e instanceof Error ? e.message : '退出失败')
    }
  }
  const active = nav.find((n) => n.id === view)!,
    selected = typeof projectId === 'number' ? projects.find((p) => p.id === projectId) : undefined
  const filtered = projects.filter(
    (p) =>
      (filter === 'all' ||
        (filter === 'published' && p.published) ||
        (filter === 'draft' && !p.published) ||
        p.category === filter) &&
      (p.title + p.summary + p.group).toLowerCase().includes(q.toLowerCase()),
  )
  const link = (n: (typeof nav)[number]) => (
    <Link
      key={n.id}
      href={href(n.id)}
      className={view === n.id ? 'active' : ''}
      aria-current={view === n.id ? 'page' : undefined}
      title={n.label}
      onClick={(e) => {
        if (!allow()) {
          e.preventDefault()
          return
        }
        setMore(false)
      }}
    >
      <Icon name={n.icon} />
      <span>{n.label}</span>
    </Link>
  )
  return (
    <div className={'studio-app ' + (collapsed ? 'is-collapsed' : '')}>
      <aside className="studio-sidebar">
        <div className="studio-brand">
          <Link
            href="/duanap"
            onClick={(e) => {
              if (!allow()) e.preventDefault()
            }}
          >
            <span className="logo">
              duan<span>ap</span>
            </span>
            <span className="logo-studio"> Studio</span>
          </Link>
        </div>
        <nav className="studio-side-nav" aria-label="后台侧栏">
          {Array.from(new Set(nav.map((n) => n.group))).map((group) => (
            <div key={group}>
              <p className="sidebar-group">{group}</p>
              {nav.filter((n) => n.group === group).map(link)}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Icon name="arrow" />
            <span>打开网站</span>
          </a>
          <button onClick={() => void logout()} aria-label="退出登录">
            <Icon name="user" />
            <span>退出登录</span>
          </button>
        </div>
      </aside>
      <main className="studio-stage">
        <header className="studio-top">
          <button
            disabled={!ready}
            className="icon-button sidebar-collapse"
            aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
            onClick={() => setCollapsed((v) => !v)}
          >
            <Icon name="grid" />
          </button>
          <Link
            href="/duanap"
            className="hub-studio-mobile-brand"
            onClick={(event) => {
              if (!allow()) event.preventDefault()
            }}
          >
            duanap Studio
          </Link>
          <span className="studio-crumb">{active.label}</span>
          <div className="studio-top-actions">
            <a href="/" target="_blank" rel="noopener noreferrer" className="preview-link">
              预览网站 ↗
            </a>
            <ThemeToggle />
            <button
              disabled={!ready}
              className="icon-button"
              aria-label="退出登录"
              onClick={() => void logout()}
            >
              <Icon name="user" />
            </button>
          </div>
        </header>
        <div className="studio-content" aria-busy={!ready}>
          <fieldset disabled={!ready}>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            {view === 'overview' && (
              <>
                <section className="studio-heading-banner">
                  <h1>欢迎回到你的小空间。</h1>
                  <p>把有趣的想法，认真打磨成作品。</p>
                </section>
                <div className="dashboard-stats">
                  {[
                    ['已发布作品', projects.filter((p) => p.published).length, '当前 SQLite 内容'],
                    ['草稿项目', projects.filter((p) => !p.published).length, '仅后台可见'],
                    [
                      '可用工具',
                      initialTools.filter((t) => t.enabled).length,
                      '本地工具，不依赖外部 API',
                    ],
                  ].map(([label, count, note]) => (
                    <div className="stat-card" key={label}>
                      <span className="stat-icon">
                        <Icon name="folder" />
                      </span>
                      <div>
                        <small>{label}</small>
                        <strong>{count}</strong>
                        <p>{note}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <section className="studio-panel form-panel">
                  <h2>快捷操作</h2>
                  <div className="studio-quick-grid">
                    <button onClick={() => navigate('/duanap/projects/new')}>
                      <Icon name="folder" />
                      创建项目
                    </button>
                    <button onClick={() => navigate('/duanap/home')}>
                      <Icon name="grid" />
                      编排首页
                    </button>
                    <button onClick={() => navigate('/duanap/site')}>
                      <Icon name="user" />
                      编辑资料
                    </button>
                    <button onClick={() => navigate('/duanap/backups')}>
                      <Icon name="download" />
                      安全备份
                    </button>
                  </div>
                </section>
                <div className="studio-grid-two">
                  <section className="studio-panel form-panel">
                    <h2>项目动态</h2>
                    {initialEntries.slice(0, 5).map((e) => (
                      <div className="admin-entry" key={e.id}>
                        <div>
                          <strong>{e.title}</strong>
                          <small>
                            {e.published ? '已发布' : '草稿'} · {businessDay(e.updatedAt)}
                          </small>
                        </div>
                      </div>
                    ))}
                    {!initialEntries.length && <p className="quiet-empty">还没有项目动态。</p>}
                  </section>
                  <section className="studio-panel form-panel">
                    <h2>访问统计 · 待完善</h2>
                    <p className="muted">
                      当前没有接入访问采集或 EdgeOne 数据。这里不展示虚构 PV、UV 或实时人数。
                    </p>
                    <div className="pending-state">等待真实数据接入</div>
                  </section>
                </div>
              </>
            )}
            {view === 'projects' && projectId === undefined && (
              <>
                <div className="editor-heading">
                  <div>
                    <h1>项目与作品</h1>
                    <p className="muted">记录作品、版本与下一步的想法。</p>
                  </div>
                  <button
                    className="button button-primary"
                    onClick={() => navigate('/duanap/projects/new')}
                  >
                    + 新增项目
                  </button>
                </div>
                <div className="filter-bar">
                  <div className="filter-tabs">
                    {[
                      ['all', '全部'],
                      ['published', '已发布'],
                      ['draft', '草稿'],
                      ['game', '小游戏'],
                      ['website', '网站应用'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={filter === id ? 'active' : ''}
                        onClick={() => setFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="search-box">
                    <Icon name="search" />
                    <input
                      aria-label="搜索后台项目"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="搜索项目…"
                    />
                  </label>
                </div>
                <div className="studio-project-grid">
                  {filtered.map((p) => (
                    <button
                      className="studio-project-card"
                      key={p.id}
                      onClick={() => navigate('/duanap/projects/' + p.id)}
                    >
                      {p.coverUrl ? (
                        <img src={p.coverUrl} alt="" />
                      ) : (
                        <div className="admin-cover-fallback">
                          <Icon name="folder" />
                        </div>
                      )}
                      <div>
                        <small>
                          {p.published ? '已发布' : '草稿'} · {STATUS_LABELS[p.status]}
                        </small>
                        <strong>{p.title}</strong>
                        <p>{p.summary || '暂无简介'}</p>
                        <span>{p.version || '未设版本'} · 编辑项目 ↗</span>
                      </div>
                    </button>
                  ))}
                </div>
                {!filtered.length && (
                  <div className="empty-state">
                    <h2>还没有匹配的项目。</h2>
                    <p>从一个小小的想法开始。</p>
                  </div>
                )}
              </>
            )}
            {view === 'projects' && projectId !== undefined && (
              <ProjectEditor
                project={selected}
                initialEntries={initialEntries.filter((e) => e.projectId === selected?.id)}
                onDirty={onDirty}
                onSaved={(p) => {
                  setProjects((old) => [...old.filter((x) => x.id !== p.id), p])
                  if (projectId === 'new') router.replace('/duanap/projects/' + p.id)
                }}
                onDeleted={() => router.push('/duanap/projects')}
              />
            )}
            {view === 'home' && <ModuleEditor initial={initialModules} />}
            {view === 'tools' && <ToolsEditor items={initialTools} onDirty={onDirty} />}
            {(view === 'site' || view === 'seo' || view === 'appearance') && (
              <SiteEditor settings={initialSettings} mode={view} onDirty={onDirty} />
            )}
            {view === 'media' && <MediaPanel initial={initialMedia} />}
            {view === 'backups' && <BackupsPanel initial={initialBackups} />}
            {view === 'games' && (
              <>
                <h1>游戏展示</h1>
                <p className="muted">游戏是项目的一个类别，使用同一份内容和人工状态。</p>
                <div className="studio-project-grid">
                  {projects
                    .filter((p) => p.category === 'game')
                    .map((p) => (
                      <button
                        className="studio-project-card"
                        key={p.id}
                        onClick={() => navigate('/duanap/projects/' + p.id)}
                      >
                        <div>
                          <strong>{p.title}</strong>
                          <small>
                            {STATUS_LABELS[p.status]} · {p.published ? '已发布' : '草稿'}
                          </small>
                          <p>{p.summary}</p>
                        </div>
                      </button>
                    ))}
                </div>
                <section className="studio-panel form-panel">
                  <h2>角色与战绩 · P3 待完善</h2>
                  <p className="muted">由独立游戏服务提供权威数据，当前不展示模拟战绩。</p>
                </section>
              </>
            )}
            {view === 'analytics' && (
              <>
                <h1>访问统计 · 待完善</h1>
                <section className="studio-panel form-panel">
                  <h2>等待真实数据</h2>
                  <p className="muted">
                    尚未接入访问采集、EdgeOne
                    或第三方统计。接入后会标注来源、时间段和数据新鲜度，请求数不会称作 UV/PV。
                  </p>
                  <div className="pending-state">暂无运营指标</div>
                </section>
              </>
            )}
            {view === 'integrations' && (
              <>
                <h1>外部集成</h1>
                <p className="muted">Core 可独立运行；未实现的适配器不会请求外部服务。</p>
                <div className="studio-grid-two">
                  {[
                    ['WordPress / 子比', 'P2 · 用户与积分权威'],
                    ['QQ 登录', 'P2 · 统一身份入口'],
                    ['小游戏与 QQ 机器人', 'P3 · 独立业务 API'],
                    ['博客 / EdgeOne / GitHub', 'P3 · 只读摘要和真实统计'],
                  ].map(([name, phase]) => (
                    <section className="studio-panel form-panel" key={name}>
                      <h2>{name}</h2>
                      <p>{phase}</p>
                      <div className="pending-state">待完善 · 未连接</div>
                    </section>
                  ))}
                </div>
              </>
            )}
            {view === 'users' && (
              <>
                <h1>统一用户 · P2 待完善</h1>
                <section className="studio-panel form-panel">
                  <h2>用户与管理员分权</h2>
                  <p className="muted">
                    普通用户、第三方绑定、签到与积分将在 P2 由
                    WordPress/子比权威接入。此处没有模拟用户记录；当前 Studio 使用独立管理员会话。
                  </p>
                </section>
              </>
            )}
          </fieldset>
        </div>
      </main>
      <nav className="mobile-bottom-bar studio-bottom-bar" aria-label="手机后台导航">
        {(['overview', 'projects', 'home', 'tools'] as StudioView[]).map((id, i) => (
          <Link
            href={href(id)}
            key={id}
            className={'bottom-item ' + (view === id ? 'is-selected' : '')}
            aria-current={view === id ? 'page' : undefined}
            onClick={(e) => {
              if (!allow()) e.preventDefault()
            }}
          >
            <Icon name={nav.find((n) => n.id === id)!.icon} />
            <span>{['工作台', '项目', '首页', '工具'][i]}</span>
          </Link>
        ))}
        <button
          disabled={!ready}
          ref={moreButton}
          className="bottom-item"
          aria-expanded={more}
          onClick={() => setMore(true)}
        >
          <Icon name="more" />
          <span>更多</span>
        </button>
      </nav>
      {more && (
        <div className="hub-drawer-overlay" onClick={() => setMore(false)}>
          <div
            ref={dialog}
            className="hub-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="更多管理功能"
            onKeyDown={drawerKey}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <h2>更多管理功能</h2>
              <button
                className="icon-button"
                aria-label="关闭更多管理功能"
                onClick={() => setMore(false)}
              >
                <Icon name="close" />
              </button>
            </div>
            <nav className="drawer-links">
              {nav
                .filter((n) => !['overview', 'projects', 'home', 'tools'].includes(n.id))
                .map(link)}
            </nav>
          </div>
        </div>
      )}
    </div>
  )
}
