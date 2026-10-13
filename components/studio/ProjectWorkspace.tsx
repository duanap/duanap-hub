'use client'

import { useEffect, useMemo, useState } from 'react'
import type { EntryType, Project, ProjectCategory, ProjectEntry, ProjectStatus } from '@/lib/types'
import { ENTRY_LABELS, STATUS_LABELS, ROADMAP_LABELS, type RoadmapStatus } from '@/lib/types'
import { MarkdownEditor } from './MarkdownEditor'
import { MediaPicker } from './MediaPicker'

export const CATEGORY_LABELS: Record<ProjectCategory, string> = {
  website: '网站 / 应用', game: '小游戏', tool: '工具', other: '其他',
}
export const blankProject = {
  slug: '', title: '', summary: '', body: '', category: 'website' as ProjectCategory,
  status: 'development' as ProjectStatus, version: '', externalUrl: '', repositoryUrl: '',
  coverUrl: '', iconUrl: '', groupName: '', tags: [] as string[], screenshots: [] as string[], versionDate: '', sortOrder: 0,
  featured: false, published: false, seoTitle: '', seoDescription: '',
}
export type ProjectDraft = typeof blankProject
export const blankEntry = { type: 'changelog' as EntryType, title: '', body: '', published: false, roadmapStatus: 'planned' as RoadmapStatus, version: '', effectiveAt: '' }
export type EntryDraft = typeof blankEntry
export function editableProject(project: Project): ProjectDraft {
  const { slug, title, summary, body, category, status, version, externalUrl, repositoryUrl,
    coverUrl, iconUrl, groupName, tags, screenshots, versionDate, sortOrder, featured, published, seoTitle, seoDescription } = project
  return { slug, title, summary, body, category, status, version, externalUrl, repositoryUrl,
    coverUrl, iconUrl, groupName, tags, screenshots, versionDate, sortOrder, featured, published, seoTitle, seoDescription }
}

type Props = {
  projects: Project[]
  entries: ProjectEntry[]
  draft: ProjectDraft
  entryDraft: EntryDraft
  activeProjectId: number | null
  activeEntryId: number | null
  editorOpen: boolean
  projectDirty: boolean
  entryDirty: boolean
  busy: boolean
  onProjectChange: (patch: Partial<ProjectDraft>) => void
  onEntryChange: (patch: Partial<EntryDraft>) => void
  onEditProject: (project?: Project) => void
  onClose: () => void
  onSaveProject: () => void
  onDeleteProject: () => void
  onEditEntry: (entry?: ProjectEntry) => void
  onSaveEntry: () => void
  onDeleteEntry: (entry: ProjectEntry) => void
  onMediaBusyChange: (busy: boolean) => void
}

export function ProjectWorkspace(props: Props) {
  const { projects, entries, draft, entryDraft, activeProjectId, activeEntryId, editorOpen,
    projectDirty, entryDirty, busy, onProjectChange, onEntryChange, onEditProject, onClose,
    onSaveProject, onDeleteProject, onEditEntry, onSaveEntry, onDeleteEntry, onMediaBusyChange } = props
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [publication, setPublication] = useState('all')
  const [status, setStatus] = useState('all')
  const [tagInput, setTagInput] = useState(draft.tags.join(', '))
  useEffect(() => { setTagInput(draft.tags.join(', ')) }, [activeProjectId, editorOpen])
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return projects.filter(project =>
      (!query || `${project.title} ${project.slug} ${project.summary} ${project.groupName} ${project.tags.join(' ')}`.toLocaleLowerCase().includes(query)) &&
      (category === 'all' || project.category === category) &&
      (status === 'all' || project.status === status) &&
      (publication === 'all' || project.published === (publication === 'published')))
  }, [projects, search, category, publication, status])

  const textField = (label: string, key: keyof ProjectDraft, placeholder = '') => <label className="field">
    <span>{label}</span><input value={String(draft[key])} placeholder={placeholder}
      maxLength={key === 'title' ? 100 : 1200}
      onChange={event => onProjectChange({ [key]: key === 'slug' ? event.target.value.toLowerCase() : event.target.value })} />
  </label>

  return <>
    {!editorOpen && <section className="studio-card">
      <div className="card-heading"><div><h2>项目与作品</h2><p>管理公开作品、草稿和更新记录。</p></div>
        <button disabled={busy} type="button" className="action-primary" onClick={() => onEditProject()}>+ 新增项目</button>
      </div>
      <div className="project-filters">
        <label className="field project-search"><span>搜索项目</span><input type="search" value={search}
          placeholder="名称、URL 标识或简介" onChange={event => setSearch(event.target.value)} /></label>
        <label className="field"><span>分类筛选</span><select value={category} onChange={event => setCategory(event.target.value)}>
          <option value="all">全部分类</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="field"><span>发布筛选</span><select value={publication} onChange={event => setPublication(event.target.value)}>
          <option value="all">全部发布状态</option><option value="published">已发布</option><option value="draft">草稿</option>
        </select></label>
        <label className="field"><span>运营状态筛选</span><select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">全部运营状态</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <p className="project-result-count">显示 {filtered.length} / {projects.length} 个项目</p>
      {filtered.length ? <div className="studio-project-grid">{filtered.map(project =>
        <button type="button" key={project.id} className="studio-project" disabled={busy}
          aria-label={`编辑项目：${project.title}`} onClick={() => onEditProject(project)}>
          <span className="studio-project-head"><span className="project-avatar">{project.iconUrl ? <img src={project.iconUrl} alt="" /> : project.title.slice(0, 1)}</span>
            <span className={`publication-badge ${project.published ? 'published' : ''}`}>{project.published ? '已发布' : '草稿'}</span></span>
          <strong className="studio-project-title">{project.title}</strong>
          <small>{project.summary || '暂无简介'}</small>
          <span className="studio-project-meta"><span>{CATEGORY_LABELS[project.category]}</span><span>{project.version || '未设版本'}</span></span>
          <span className="studio-project-footer"><span className={`project-state status-${project.status}`}>{STATUS_LABELS[project.status]}</span><span>编辑 →</span></span>
        </button>)}</div> : <div className="studio-empty">
          <strong>{projects.length ? '没有符合条件的项目' : '从第一个作品开始'}</strong>
          <p>{projects.length ? '试试其他关键词或筛选条件。' : '新建项目默认保存为草稿，准备好后再发布。'}</p>
          {projects.length > 0 && <button type="button" className="action-secondary" onClick={() => { setSearch(''); setCategory('all'); setPublication('all'); setStatus('all') }}>清除筛选</button>}
        </div>}
    </section>}
    {editorOpen && <>
      <div className="project-editor-toolbar">
        <button type="button" className="action-secondary" disabled={busy} onClick={onClose}>返回项目列表</button>
        <span className="draft-indicator">{projectDirty || entryDirty ? '有未保存的修改' : '没有未保存的修改'}</span>
        {activeProjectId && projects.find(project => project.id === activeProjectId)?.published &&
          <a className="subtle-link" href={`/projects/${projects.find(project => project.id === activeProjectId)!.slug}`} target="_blank" rel="noopener noreferrer">查看公开页面 ↗</a>}
      </div>
      <form onSubmit={event => { event.preventDefault(); onSaveProject() }}>
        <fieldset className="studio-fieldset" disabled={busy}>
          <section className="studio-card"><div className="card-heading"><div><h2>{activeProjectId ? '编辑项目' : '创建新项目'}</h2><p>发布状态控制公开范围；运营状态由你手动维护。</p></div>
            <span className={`publication-badge ${draft.published ? 'published' : ''}`}>{draft.published ? '准备公开' : '草稿'}</span></div>
            <div className="form-columns">
              {textField('项目名称', 'title')}{textField('URL 标识（slug）', 'slug', 'my-project')}
              <label className="field"><span>项目类别</span><select value={draft.category} onChange={event => onProjectChange({ category: event.target.value as ProjectCategory })}>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label className="field"><span>手动运营状态</span><select value={draft.status} onChange={event => onProjectChange({ status: event.target.value as ProjectStatus })}>
                {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              {textField('当前版本', 'version', 'v1.0.0')}
              <label className="field"><span>版本发布日期</span><input type="date" value={draft.versionDate} onChange={event => onProjectChange({ versionDate: event.target.value })} /></label>
              {textField('分组', 'groupName')}
              <label className="field"><span>显示顺序</span><input type="number" min={0} max={99999} value={draft.sortOrder} onChange={event => onProjectChange({ sortOrder: Number(event.target.value) })} /></label>
              <label className="field span-two"><span>标签（逗号分隔）</span><input value={tagInput} onChange={event => { setTagInput(event.target.value); onProjectChange({ tags: event.target.value.split(',').map(value => value.trim()) }) }} /></label>
              <MediaPicker key={'icon-' + activeProjectId} label="项目图标" value={draft.iconUrl} onChange={iconUrl => onProjectChange({ iconUrl })} onBusyChange={onMediaBusyChange} />
              <MediaPicker key={'cover-' + activeProjectId} label="封面图片地址" value={draft.coverUrl} onChange={coverUrl => onProjectChange({ coverUrl })} onBusyChange={onMediaBusyChange} />
              {textField('在线地址', 'externalUrl', 'https://…')}{textField('仓库地址', 'repositoryUrl', 'https://github.com/…')}
              <label className="field span-two"><span>项目摘要</span><textarea rows={2} maxLength={1200} value={draft.summary} onChange={event => onProjectChange({ summary: event.target.value })} /></label>
              <MarkdownEditor key={`project-${activeProjectId}`} label="项目介绍（Markdown）" name="项目正文" value={draft.body} disabled={busy} onChange={body => onProjectChange({ body })} />
              <div className="span-two"><div className="card-heading"><h3>项目截图</h3><button type="button" className="action-secondary" disabled={draft.screenshots.length >= 20} onClick={() => onProjectChange({ screenshots: [...draft.screenshots, ''] })}>添加截图</button></div>
                <div className="form-columns">{draft.screenshots.map((url, index) => <div key={index}><MediaPicker label={'截图 ' + (index + 1)} value={url} onChange={next => onProjectChange({ screenshots: draft.screenshots.map((value, idx) => idx === index ? next : value) })} onBusyChange={onMediaBusyChange} />
                  <button type="button" className="text-action destructive" onClick={() => onProjectChange({ screenshots: draft.screenshots.filter((_, idx) => idx !== index) })}>移除截图</button></div>)}</div>
              </div>
            </div>
          </section>
          <section className="studio-card"><h2>搜索与发布</h2><div className="form-columns">
            {textField('独立 SEO 标题（可选）', 'seoTitle')}{textField('SEO 描述（可选）', 'seoDescription')}
          </div><div className="form-actions">
            <label className="check-choice"><input type="checkbox" checked={draft.published} onChange={event => onProjectChange({ published: event.target.checked })} />公开发布</label>
            <label className="check-choice"><input type="checkbox" checked={draft.featured} onChange={event => onProjectChange({ featured: event.target.checked })} />首页精选</label>
            <button className="action-primary" type="submit">{busy ? '保存中…' : '保存项目'}</button>
            {activeProjectId && <button type="button" className="text-action destructive" onClick={onDeleteProject}>删除项目</button>}
          </div></section>
        </fieldset>
      </form>
      {activeProjectId ? <section className="studio-card"><div className="card-heading"><div><h2>更新日志与公告</h2><p>日志、预告、维护公告、路线图与玩法说明。每条记录独立发布。</p></div></div>
        {entries.length > 0 && <div className="admin-entry-list">{entries.map(entry => <div key={entry.id} className="admin-entry">
          <div><strong>{entry.title}</strong><small>{ENTRY_LABELS[entry.type]} · {entry.published ? '已发布' : '草稿'}</small></div>
          <div className="entry-actions"><button type="button" disabled={busy} aria-label={`编辑公告：${entry.title}`} onClick={() => onEditEntry(entry)}>编辑</button>
            <button type="button" disabled={busy} className="destructive" aria-label={`删除公告：${entry.title}`} onClick={() => onDeleteEntry(entry)}>删除</button></div>
        </div>)}</div>}
        <form onSubmit={event => { event.preventDefault(); onSaveEntry() }}><fieldset className="studio-fieldset" disabled={busy}>
          <div className="card-heading"><h3>{activeEntryId ? '编辑记录' : '新增记录'}</h3><span className="draft-indicator">{entryDirty ? '公告尚未保存' : ''}</span></div>
          <div className="form-columns">
            <label className="field"><span>内容类型</span><select value={entryDraft.type} onChange={event => onEntryChange({ type: event.target.value as EntryType })}>
              {Object.entries(ENTRY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="field"><span>标题</span><input maxLength={180} value={entryDraft.title} onChange={event => onEntryChange({ title: event.target.value })} /></label>
            <label className="field"><span>关联版本</span><input value={entryDraft.version} onChange={event => onEntryChange({ version: event.target.value })} placeholder="v1.0.0" /></label>
            <label className="field"><span>路线图进度</span><select value={entryDraft.roadmapStatus} onChange={event => onEntryChange({ roadmapStatus: event.target.value as RoadmapStatus })}>
              {Object.entries(ROADMAP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="field span-two"><span>生效时间（UTC，可留空立即发布）</span><input value={entryDraft.effectiveAt} placeholder="2026-10-13T12:00:00.000Z" onChange={event => onEntryChange({ effectiveAt: event.target.value })} /></label>
            <MarkdownEditor key={`entry-${activeEntryId}`} label="正文（Markdown）" name="公告正文" value={entryDraft.body} disabled={busy} onChange={body => onEntryChange({ body })} />
          </div><div className="form-actions">
            <label className="check-choice"><input type="checkbox" checked={entryDraft.published} onChange={event => onEntryChange({ published: event.target.checked })} />公开发布</label>
            <button className="action-primary" type="submit">{activeEntryId ? '更新记录' : '新增记录'}</button>
            {(activeEntryId || entryDirty) && <button type="button" className="text-action" onClick={() => onEditEntry()}>取消编辑</button>}
          </div>
        </fieldset></form>
      </section> : <section className="studio-card"><p>先保存项目，即可添加更新日志和公告。</p></section>}
    </>}
  </>
}
