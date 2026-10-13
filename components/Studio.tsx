'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { HubSettings, ModuleState, Project, ProjectEntry } from '@/lib/types'
import { ProjectWorkspace, blankEntry, blankProject, editableProject, type EntryDraft, type ProjectDraft } from './studio/ProjectWorkspace'

type Tab = 'overview' | 'projects' | 'site' | 'seo' | 'modules' | 'system'
const nav: [Tab, string][] = [['overview', '概览'], ['projects', '项目与公告'], ['site', '主页资料'], ['seo', 'SEO 与备案'], ['modules', '模块管理'], ['system', '系统信息']]
const groups: { label: string; tabs: Tab[] }[] = [
  { label: '工作台', tabs: ['overview'] },
  { label: '内容管理', tabs: ['projects', 'site', 'modules'] },
  { label: '站点管理', tabs: ['seo', 'system'] },
]

async function api<T>(url: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', payload?: object): Promise<T> {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined })
  const data = await response.json().catch(() => ({ error: '服务器返回了无效响应' }))
  if (response.status === 401) {
    window.location.assign('/duanap/login')
    throw new Error('会话已过期')
  }
  if (!response.ok) throw new Error(data.error || '操作失败')
  return data as T
}

export function Studio({ initialSettings, initialModules, initialProjects, initialEntries }: {
  initialSettings: HubSettings; initialModules: ModuleState[]; initialProjects: Project[]; initialEntries: ProjectEntry[]
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [settings, setSettings] = useState(initialSettings)
  const [savedSettings, setSavedSettings] = useState(initialSettings)
  const [modules, setModules] = useState(initialModules)
  const [projects, setProjects] = useState(initialProjects)
  const [entries, setEntries] = useState(initialEntries)
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
  const [draft, setDraft] = useState<ProjectDraft>({ ...blankProject })
  const [savedDraft, setSavedDraft] = useState<ProjectDraft>({ ...blankProject })
  const [projectEditorOpen, setProjectEditorOpen] = useState(false)
  const [entryDraft, setEntryDraft] = useState<EntryDraft>({ ...blankEntry })
  const [savedEntryDraft, setSavedEntryDraft] = useState<EntryDraft>({ ...blankEntry })
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const intentionalNavigation = useRef(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const projectEntries = useMemo(() => entries.filter(entry => entry.projectId === activeProjectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [entries, activeProjectId])
  const projectDirty = projectEditorOpen && JSON.stringify(draft) !== JSON.stringify(savedDraft)
  const entryDirty = projectEditorOpen && JSON.stringify(entryDraft) !== JSON.stringify(savedEntryDraft)
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)
  const dirty = projectDirty || entryDirty || settingsDirty

  useEffect(() => {
    if (!dirty && !busy) return
    const warn = (event: BeforeUnloadEvent) => {
      if (intentionalNavigation.current) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])

  async function perform(action: () => Promise<void>, message = '已保存') {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true); setError(''); setNotice('')
    try { await action(); setNotice(message) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败') }
    finally { busyRef.current = false; setBusy(false) }
  }
  function confirmLeave(hasChanges = dirty) {
    if (busyRef.current) return false
    return !hasChanges || window.confirm('有未保存的修改，离开会丢弃这些修改。继续吗？')
  }
  function resetEntry(entry?: ProjectEntry) {
    const next = entry ? { type: entry.type, title: entry.title, body: entry.body, published: entry.published } : { ...blankEntry }
    setActiveEntryId(entry?.id ?? null); setEntryDraft(next); setSavedEntryDraft(next)
  }
  function closeProject() {
    setProjectEditorOpen(false); setActiveProjectId(null)
    setDraft({ ...blankProject }); setSavedDraft({ ...blankProject }); resetEntry()
  }
  function changeTab(next: Tab) {
    if (next === tab || !confirmLeave()) return
    closeProject(); setSettings(savedSettings)
    setTab(next); setNotice(''); setError('')
  }
  function editProject(project?: Project) {
    if (!confirmLeave(projectDirty || entryDirty || settingsDirty)) return
    const next = project ? editableProject(project) : { ...blankProject }
    setSettings(savedSettings); setTab('projects'); setProjectEditorOpen(true)
    setActiveProjectId(project?.id ?? null); setDraft(next); setSavedDraft(next); resetEntry()
    setNotice(''); setError('')
  }
  function editEntry(entry?: ProjectEntry) {
    if (!confirmLeave(entryDirty)) return
    resetEntry(entry); setNotice(''); setError('')
  }
  function field<K extends keyof HubSettings>(key: K, value: HubSettings[K]) {
    setSettings(previous => ({ ...previous, [key]: value }))
  }
  async function saveSite() {
    await perform(async () => {
      const data = await api<{ settings: HubSettings }>('/api/studio/site', 'PUT', settings)
      setSettings(data.settings); setSavedSettings(data.settings)
    }, '站点设置已保存')
  }
  async function saveProject() {
    await perform(async () => {
      const url = activeProjectId ? '/api/studio/projects/' + activeProjectId : '/api/studio/projects'
      const data = await api<{ project: Project; projects: Project[] }>(url, activeProjectId ? 'PATCH' : 'POST', draft)
      const next = editableProject(data.project)
      setProjects(data.projects); setActiveProjectId(data.project.id); setDraft(next); setSavedDraft(next)
    }, activeProjectId ? '项目已更新' : '项目已创建')
  }
  async function removeProject() {
    if (busyRef.current || !activeProjectId || !window.confirm('删除“' + draft.title + '”及其全部更新记录？此操作无法撤销。')) return
    await perform(async () => {
      const data = await api<{ projects: Project[] }>('/api/studio/projects/' + activeProjectId, 'DELETE')
      setProjects(data.projects); setEntries(previous => previous.filter(entry => entry.projectId !== activeProjectId)); closeProject()
    }, '项目已删除')
  }
  async function saveEntry() {
    if (!activeProjectId) return
    await perform(async () => {
      const url = activeEntryId ? '/api/studio/entries/' + activeEntryId : '/api/studio/entries'
      const payload = activeEntryId ? entryDraft : { ...entryDraft, projectId: activeProjectId }
      const data = await api<{ entries: ProjectEntry[] }>(url, activeEntryId ? 'PATCH' : 'POST', payload)
      setEntries(previous => [...previous.filter(entry => entry.projectId !== activeProjectId), ...data.entries])
      resetEntry()
    }, activeEntryId ? '更新记录已修改' : '更新记录已创建')
  }
  async function removeEntry(entry: ProjectEntry) {
    if (busyRef.current || !confirmLeave(entryDirty) || !window.confirm('删除“' + entry.title + '”？此操作无法撤销。')) return
    await perform(async () => {
      const data = await api<{ entries: ProjectEntry[] }>('/api/studio/entries/' + entry.id, 'DELETE')
      setEntries(previous => [...previous.filter(item => item.projectId !== entry.projectId), ...data.entries])
      resetEntry()
    }, '更新记录已删除')
  }
  async function toggleModule(module: ModuleState) {
    await perform(async () => {
      const data = await api<{ modules: ModuleState[] }>('/api/studio/modules', 'PATCH', { id: module.id, enabled: !module.enabled })
      setModules(data.modules)
    }, module.enabled ? '模块已关闭' : '模块已启用')
  }
  async function moveModule(index: number, direction: -1 | 1) {
    const values = [...modules], next = index + direction
    if (next < 0 || next >= values.length) return
    ;[values[index], values[next]] = [values[next], values[index]]
    await perform(async () => {
      const data = await api<{ modules: ModuleState[] }>('/api/studio/modules', 'PATCH', { order: values.map(module => module.id) })
      setModules(data.modules)
    }, '排序已保存')
  }
  async function logout() {
    if (!confirmLeave()) return
    await perform(async () => {
      await api('/api/studio/logout', 'POST')
      intentionalNavigation.current = true
      window.location.assign('/duanap/login')
    }, '')
  }
  const input = (label: string, key: keyof HubSettings) => <label className="field" key={key}><span>{label}</span>
    <input value={String(settings[key])} onChange={event => field(key, event.target.value as HubSettings[typeof key])} /></label>

  return <div className="studio-root"><aside className="studio-sidebar">
    <div className="studio-brand"><span className="brand-icon">d.</span><div><strong>duanap Studio</strong><small>个人网站管理</small></div></div>
    <nav className="studio-nav" aria-label="工作台导航">{groups.map(group => <div className="studio-nav-group" key={group.label}>
      <div className="studio-sidebar-label">{group.label}</div>{group.tabs.map(id => <button key={id} disabled={busy}
        className={tab === id ? 'selected' : ''} aria-current={tab === id ? 'page' : undefined} type="button" onClick={() => changeTab(id)}>
        {nav.find(([key]) => key === id)![1]}
      </button>)}</div>)}</nav>
    <div className="studio-sidebar-bottom"><a href="/" target="_blank" rel="noopener noreferrer">打开网站 ↗</a>
      <button type="button" disabled={busy} onClick={() => void logout()}>退出登录</button></div>
  </aside><main className="studio-main" aria-busy={busy}>
    <header className="studio-top"><div><span className="eyebrow">DUANAP / STUDIO</span><h1>{nav.find(([id]) => id === tab)?.[1]}</h1>
      <p>{tab === 'projects' ? '让作品、版本和公告保持最新。' : '你的个人网站，从这里管理。'}</p></div>
      <div className="studio-top-actions"><a className="action-secondary" href="/" target="_blank" rel="noopener noreferrer">预览网站 ↗</a></div></header>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {tab === 'overview' && <>
      <div className="studio-metrics">
        <div className="metric-tile"><span>项目总数</span><strong>{projects.length}</strong><small>含草稿</small></div>
        <div className="metric-tile"><span>已发布项目</span><strong>{projects.filter(project => project.published).length}</strong><small>当前公开</small></div>
        <div className="metric-tile"><span>启用模块</span><strong>{modules.filter(module => module.enabled).length}</strong><small>内置注册模块</small></div>
        <div className="metric-tile"><span>已发布动态</span><strong>{entries.filter(entry => entry.published && projects.some(project => project.id === entry.projectId && project.published)).length}</strong><small>公开项目的更新与公告</small></div>
      </div>
      <div className="studio-grid-two"><section className="studio-card"><h2>快捷操作</h2><div className="quick-grid">
        <button disabled={busy} onClick={() => editProject()}>新增项目 <span>↗</span></button>
        <button disabled={busy} onClick={() => changeTab('site')}>编辑主页 <span>↗</span></button>
        <button disabled={busy} onClick={() => changeTab('modules')}>管理模块 <span>↗</span></button>
        <button disabled={busy} onClick={() => changeTab('seo')}>搜索设置 <span>↗</span></button>
      </div></section><section className="studio-card"><h2>后续扩展</h2>
        <div className="placeholder-stack">WordPress 会员与积分 · P2</div><div className="placeholder-stack">博客、游戏与外部数据 · P3</div>
        <p className="form-hint">目前专注主站内容管理。</p></section></div>
    </>}
    {tab === 'projects' && <ProjectWorkspace projects={projects} entries={projectEntries} draft={draft} entryDraft={entryDraft}
      activeProjectId={activeProjectId} activeEntryId={activeEntryId} editorOpen={projectEditorOpen}
      projectDirty={projectDirty} entryDirty={entryDirty} busy={busy}
      onProjectChange={patch => setDraft(previous => ({ ...previous, ...patch }))}
      onEntryChange={patch => setEntryDraft(previous => ({ ...previous, ...patch }))}
      onEditProject={editProject} onClose={() => { if (confirmLeave(projectDirty || entryDirty)) closeProject() }}
      onSaveProject={() => void saveProject()} onDeleteProject={() => void removeProject()}
      onEditEntry={editEntry} onSaveEntry={() => void saveEntry()} onDeleteEntry={entry => void removeEntry(entry)} />}
    {tab === 'site' && <fieldset className="studio-fieldset studio-grid-two" disabled={busy}>
      <section className="studio-card"><h2>基本资料</h2><div className="form-stack">{input('网站名称', 'siteName')}{input('昵称', 'displayName')}{input('一句话介绍', 'tagline')}
        <label className="field"><span>个人介绍（Markdown）</span><textarea rows={8} value={settings.biography} onChange={event => field('biography', event.target.value)} /></label>
      </div></section><section className="studio-card"><h2>社交与联系</h2><div className="form-stack">
        {input('GitHub 地址', 'githubUrl')}{input('公开邮箱', 'publicEmail')}{input('头像图片地址', 'avatarUrl')}{input('版权署名', 'copyright')}
      </div></section><div className="studio-form-bottom"><span className="draft-indicator">{settingsDirty ? '有未保存的修改' : ''}</span>
        <button type="button" className="action-primary" onClick={() => void saveSite()}>{busy ? '保存中…' : '保存站点资料'}</button></div>
    </fieldset>}
    {tab === 'seo' && <fieldset className="studio-fieldset studio-grid-two" disabled={busy}>
      <section className="studio-card"><h2>SEO 基础设置</h2><div className="form-stack">{input('首页搜索标题', 'seoTitle')}
        <label className="field"><span>首页描述</span><textarea rows={4} value={settings.seoDescription} onChange={event => field('seoDescription', event.target.value)} /></label>
        <label className="check-choice"><input type="checkbox" checked={settings.seoIndexable} onChange={event => field('seoIndexable', event.target.checked)} />允许公开页面收录</label>
      </div><p className="form-hint">项目的 SEO 信息在项目编辑页设置。</p></section>
      <section className="studio-card"><h2>ICP备案</h2><div className="form-stack">{input('ICP备案号', 'icpNumber')}{input('ICP 地址', 'icpUrl')}</div></section>
      <section className="studio-card"><h2>公安备案</h2><div className="form-stack">{input('公安备案号', 'policeNumber')}{input('公安备案 URL', 'policeUrl')}</div></section>
      <section className="studio-card"><h2>爬虫与 RSS</h2><div className="quick-grid">
        {['robots.txt', 'sitemap.xml', 'feed.xml'].map(file => <a key={file} href={'/' + file} target="_blank" rel="noopener noreferrer">{file} ↗</a>)}
      </div></section><div className="studio-form-bottom"><span className="draft-indicator">{settingsDirty ? '有未保存的修改' : ''}</span>
        <button type="button" className="action-primary" onClick={() => void saveSite()}>{busy ? '保存中…' : '保存 SEO 与备案'}</button></div>
    </fieldset>}
    {tab === 'modules' && <section className="studio-card"><div className="card-heading"><div><h2>模块管理</h2><p>启停公开模块，并调整它们的展示顺序。</p></div></div>
      <div className="module-list">{modules.map((module, index) => <div className="module-row" key={module.id}><div><strong>{module.name}</strong>
        <small>{module.summary} · 阶段 P{module.stage}</small></div><div className="module-actions">
        <button type="button" className="mini-arrow" disabled={busy || index === 0} onClick={() => void moveModule(index, -1)} aria-label={'上移 ' + module.name}>↑</button>
        <button type="button" className="mini-arrow" disabled={busy || index === modules.length - 1} onClick={() => void moveModule(index, 1)} aria-label={'下移 ' + module.name}>↓</button>
        <label className="check-choice"><input type="checkbox" disabled={busy || !module.available} checked={module.enabled} onChange={() => void toggleModule(module)} />
          <span>{module.available ? (module.enabled ? '开启' : '关闭') : '待开发'}</span></label>
      </div></div>)}</div></section>}
    {tab === 'system' && <div className="studio-grid-two"><section className="studio-card"><h2>当前开发状态</h2>
      <div className="placeholder-stack">主站内容与独立管理员后台</div><div className="placeholder-stack">数据：SQLite / WAL</div>
      <div className="placeholder-stack">账号、积分与游戏：后续阶段</div></section>
      <section className="studio-card"><h2>发布与备份</h2><p>上线前还需补齐媒体管理、备份恢复与旧站迁移验收。</p>
        <a className="subtle-link" href="/api/health" target="_blank" rel="noopener noreferrer">查看健康检查 ↗</a></section></div>}
  </main></div>
}
