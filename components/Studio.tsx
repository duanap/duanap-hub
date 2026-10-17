'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { HubSettings, ModuleState, Project, ProjectEntry } from '@/lib/types'
import { ProjectWorkspace, blankEntry, blankProject, editableProject, type EntryDraft, type ProjectDraft } from './studio/ProjectWorkspace'
import { MediaPicker } from './studio/MediaPicker'
import { MediaPanel } from './studio/MediaPanel'
import { BackupPanel } from './studio/BackupPanel'
import { ThemeControl } from '@/components/ThemeControl'
import type { ContentSettings,ContentSnapshot } from '@/lib/content-types'
import type {GithubSettings,GithubSnapshot} from '@/lib/github-types'
import type {ToolSettings} from '@/lib/tools'

type Tab = 'overview' | 'projects' | 'site' | 'home' | 'content' | 'tools' | 'github' | 'seo' | 'modules' | 'system'
const nav: [Tab, string][] = [['overview', '概览'], ['projects', '项目与公告'], ['site', '主页资料'], ['home', '首页编排'], ['content','博客动态'], ['tools','工具配置'],['github','GitHub 动态'],['seo', 'SEO 与备案'], ['modules', '模块管理'], ['system', '系统信息']]
const groups: { label: string; tabs: Tab[] }[] = [
  { label: '工作台', tabs: ['overview'] },
  { label: '内容管理', tabs: ['projects', 'content', 'tools','github','site', 'home', 'modules'] },
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

export function Studio({ initialSettings, initialModules, initialProjects, initialEntries,initialContentSettings,initialContentSnapshot,initialTools,initialGithubSettings,initialGithubSnapshot }: {
  initialSettings: HubSettings; initialModules: ModuleState[]; initialProjects: Project[]; initialEntries: ProjectEntry[]
  initialContentSettings:ContentSettings;initialContentSnapshot:ContentSnapshot
  initialTools:ToolSettings[];initialGithubSettings:GithubSettings;initialGithubSnapshot:GithubSnapshot
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [settings, setSettings] = useState(initialSettings)
  const [savedSettings, setSavedSettings] = useState(initialSettings)
  const [modules, setModules] = useState(initialModules)
  const [contentSettings,setContentSettings]=useState(initialContentSettings),[savedContentSettings,setSavedContentSettings]=useState(initialContentSettings),[contentData,setContentData]=useState(initialContentSnapshot)
  const contentDirty=JSON.stringify(contentSettings)!==JSON.stringify(savedContentSettings)
  const [toolSettings,setToolSettings]=useState(initialTools),[savedTools,setSavedTools]=useState(initialTools)
  const [githubSettings,setGithubSettings]=useState(initialGithubSettings),[savedGithub,setSavedGithub]=useState(initialGithubSettings),[githubData,setGithubData]=useState(initialGithubSnapshot),[repoText,setRepoText]=useState(initialGithubSettings.repositories.join('\n'))
  const toolsDirty=JSON.stringify(toolSettings)!==JSON.stringify(savedTools),githubDirty=JSON.stringify(githubSettings)!==JSON.stringify(savedGithub)||repoText!==savedGithub.repositories.join('\n')
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
  const mediaBusyRef = useRef(0)
  const [mediaBusy, setMediaBusy] = useState(0)
  const locked = busy || mediaBusy > 0
  function onMediaBusyChange(uploading: boolean) {
    mediaBusyRef.current = Math.max(0, mediaBusyRef.current + (uploading ? 1 : -1))
    setMediaBusy(mediaBusyRef.current)
  }
  const intentionalNavigation = useRef(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [preview, setPreview] = useState(false)
  const [phonePreview, setPhonePreview] = useState(false)
  useEffect(() => { try { setCollapsed(localStorage.getItem('hub-sidebar-collapsed') === 'true') } catch {} }, [])
  function toggleSidebar() {
    setCollapsed(!collapsed)
    try { localStorage.setItem('hub-sidebar-collapsed', String(!collapsed)) } catch {}
  }

  const projectEntries = useMemo(() => entries.filter(entry => entry.projectId === activeProjectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [entries, activeProjectId])
  const projectDirty = projectEditorOpen && JSON.stringify(draft) !== JSON.stringify(savedDraft)
  const entryDirty = projectEditorOpen && JSON.stringify(entryDraft) !== JSON.stringify(savedEntryDraft)
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)
  const dirty = projectDirty || entryDirty || settingsDirty || contentDirty || toolsDirty || githubDirty

  useEffect(() => {
    if (!dirty && !locked) return
    const warn = (event: BeforeUnloadEvent) => {
      if (intentionalNavigation.current) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, locked])

  async function perform(action: () => Promise<void>, message = '已保存') {
    if (busyRef.current || mediaBusyRef.current) return
    busyRef.current = true
    setBusy(true); setError(''); setNotice('')
    try { await action(); setNotice(message) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败') }
    finally { busyRef.current = false; setBusy(false) }
  }
  function confirmLeave(hasChanges = dirty) {
    if (busyRef.current || mediaBusyRef.current) return false
    return !hasChanges || window.confirm('有未保存的修改，离开会丢弃这些修改。继续吗？')
  }
  function resetEntry(entry?: ProjectEntry) {
    const next = entry ? { type: entry.type, title: entry.title, body: entry.body, published: entry.published, roadmapStatus: entry.roadmapStatus, version: entry.version, effectiveAt: entry.effectiveAt } : { ...blankEntry }
    setActiveEntryId(entry?.id ?? null); setEntryDraft(next); setSavedEntryDraft(next)
  }
  function closeProject() {
    setProjectEditorOpen(false); setActiveProjectId(null)
    setDraft({ ...blankProject }); setSavedDraft({ ...blankProject }); resetEntry()
  }
  function changeTab(next: Tab) {
    if (next === tab || !confirmLeave()) return
    closeProject(); setSettings(savedSettings);setContentSettings(savedContentSettings);setToolSettings(savedTools);setGithubSettings(savedGithub);setRepoText(savedGithub.repositories.join('\n'))
    setTab(next); setNotice(''); setError('')
  }
  function editProject(project?: Project) {
    if (!confirmLeave(projectDirty || entryDirty || settingsDirty || contentDirty || toolsDirty || githubDirty)) return
    const next = project ? editableProject(project) : { ...blankProject }
    setSettings(savedSettings);setContentSettings(savedContentSettings);setToolSettings(savedTools);setGithubSettings(savedGithub);setRepoText(savedGithub.repositories.join('\n')); setTab('projects'); setProjectEditorOpen(true)
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

  return <div className={'studio-root' + (collapsed ? ' sidebar-collapsed' : '')}><aside className="studio-sidebar">
    <div className="studio-brand"><span className="brand-icon">d.</span><div><strong>duanap Studio</strong><small>个人网站管理</small></div></div>
    <button type="button" className="sidebar-toggle text-action" aria-label={collapsed ? '展开侧栏' : '折叠侧栏'} onClick={toggleSidebar}>{collapsed ? '→' : '← 折叠'}</button>
    <nav className="studio-nav" aria-label="工作台导航">{groups.map(group => <div className="studio-nav-group" key={group.label}>
      <div className="studio-sidebar-label">{group.label}</div>{group.tabs.map(id => <button key={id} disabled={locked}
        className={tab === id ? 'selected' : ''} aria-label={nav.find(([key]) => key === id)![1]} aria-current={tab === id ? 'page' : undefined} type="button" onClick={() => changeTab(id)}>
        <span className="nav-symbol" aria-hidden="true">{nav.find(([key]) => key === id)![1].slice(0, 1)}</span><span className="nav-text">{nav.find(([key]) => key === id)![1]}</span>
      </button>)}</div>)}</nav>
    <div className="studio-sidebar-bottom"><a href="/" target="_blank" rel="noopener noreferrer">打开网站 ↗</a>
      <button type="button" disabled={locked} onClick={() => void logout()}>退出登录</button></div>
  </aside><main className="studio-main" aria-busy={locked}>
    <header className="studio-top"><div><span className="eyebrow">DUANAP / STUDIO</span><h1>{nav.find(([id]) => id === tab)?.[1]}</h1>
      <p>{tab === 'projects' ? '让作品、版本和公告保持最新。' : '你的个人网站，从这里管理。'}</p></div>
      <div className="studio-top-actions"><ThemeControl /><a className="action-secondary" href="/" target="_blank" rel="noopener noreferrer">预览网站 ↗</a></div></header>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {tab === 'overview' && <>
      <div className="studio-metrics">
        <div className="metric-tile"><span>项目总数</span><strong>{projects.length}</strong><small>含草稿</small></div>
        <div className="metric-tile"><span>已发布项目</span><strong>{projects.filter(project => project.published).length}</strong><small>当前公开</small></div>
        <div className="metric-tile"><span>启用模块</span><strong>{modules.filter(module => module.enabled).length}</strong><small>内置注册模块</small></div>
        <div className="metric-tile"><span>已发布动态</span><strong>{entries.filter(entry => entry.published && (!entry.effectiveAt || entry.effectiveAt <= new Date().toISOString()) && projects.some(project => project.id === entry.projectId && project.published)).length}</strong><small>公开项目的更新与公告</small></div>
      </div>
      <div className="studio-grid-two"><section className="studio-card"><h2>快捷操作</h2><div className="quick-grid">
        <button disabled={locked} onClick={() => editProject()}>新增项目 <span>↗</span></button>
        <button disabled={locked} onClick={() => changeTab('site')}>编辑主页 <span>↗</span></button>
        <button disabled={locked} onClick={() => changeTab('modules')}>管理模块 <span>↗</span></button>
        <button disabled={locked} onClick={() => changeTab('seo')}>搜索设置 <span>↗</span></button>
      </div></section><section className="studio-card"><h2>后续扩展</h2>
        <div className="placeholder-stack">WordPress 会员与积分 · P2</div><div className="placeholder-stack">博客、游戏与外部数据 · P3</div>
        <p className="form-hint">目前专注主站内容管理。</p></section></div>
    </>}
    {tab === 'projects' && <ProjectWorkspace projects={projects} entries={projectEntries} draft={draft} entryDraft={entryDraft}
      activeProjectId={activeProjectId} activeEntryId={activeEntryId} editorOpen={projectEditorOpen}
      projectDirty={projectDirty} entryDirty={entryDirty} busy={locked} onMediaBusyChange={onMediaBusyChange}
      onProjectChange={patch => setDraft(previous => ({ ...previous, ...patch }))}
      onEntryChange={patch => setEntryDraft(previous => ({ ...previous, ...patch }))}
      onEditProject={editProject} onClose={() => { if (confirmLeave(projectDirty || entryDirty)) closeProject() }}
      onSaveProject={() => void saveProject()} onDeleteProject={() => void removeProject()}
      onEditEntry={editEntry} onSaveEntry={() => void saveEntry()} onDeleteEntry={entry => void removeEntry(entry)} />}
    {tab === 'site' && <fieldset className="studio-fieldset studio-grid-two" disabled={locked}>
      <section className="studio-card"><h2>基本资料</h2><div className="form-stack">{input('网站名称', 'siteName')}{input('昵称', 'displayName')}{input('一句话介绍', 'tagline')}
        <label className="field"><span>个人介绍（Markdown）</span><textarea rows={8} value={settings.biography} onChange={event => field('biography', event.target.value)} /></label>
      </div></section><section className="studio-card"><h2>社交与联系</h2><div className="form-stack">
        {input('GitHub 地址', 'githubUrl')}{input('公开邮箱', 'publicEmail')}<MediaPicker label="头像图片地址" value={settings.avatarUrl} onChange={value => field('avatarUrl', value)} onBusyChange={onMediaBusyChange} />{input('版权署名', 'copyright')}
        <div className="field"><span>其他社交入口</span>{settings.socialLinks.map((link, index) => <div className="social-editor" key={index}>
          <input aria-label={'社交名称 ' + (index + 1)} value={link.label} placeholder="QQ / 个人主页" onChange={event => field('socialLinks', settings.socialLinks.map((value, idx) => idx === index ? { ...value, label: event.target.value } : value))} />
          <input aria-label={'社交地址 ' + (index + 1)} value={link.url} placeholder="https://…" onChange={event => field('socialLinks', settings.socialLinks.map((value, idx) => idx === index ? { ...value, url: event.target.value } : value))} />
          <button type="button" className="text-action destructive" onClick={() => field('socialLinks', settings.socialLinks.filter((_, idx) => idx !== index))}>移除</button>
        </div>)}<button type="button" className="action-secondary" disabled={settings.socialLinks.length >= 12} onClick={() => field('socialLinks', [...settings.socialLinks, { label: '', url: '' }])}>添加社交入口</button></div>
      </div></section><div className="studio-form-bottom"><span className="draft-indicator">{settingsDirty ? '有未保存的修改' : ''}</span>
        <button type="button" className="action-primary" onClick={() => void saveSite()}>{busy ? '保存中…' : '保存站点资料'}</button></div>
    </fieldset>}
    {tab === 'home' && <>
      <fieldset className="studio-fieldset" disabled={locked}><section className="studio-card"><div className="card-heading"><div><h2>首页编排</h2><p>模块顺序由模块管理控制，保存后访客立即看到新内容。</p></div><button type="button" className="action-secondary" onClick={() => setPreview(!preview)}>{preview ? '收起首页预览' : '显示首页预览'}</button></div>
        <div className="form-columns"><label className="field"><span>首页项目数量</span><input type="number" min={1} max={24} value={settings.homeProjectsLimit} onChange={event => field('homeProjectsLimit', Number(event.target.value))} /></label>
          <label className="field"><span>项目展示样式</span><select value={settings.homeLayout} onChange={event => field('homeLayout', event.target.value as HubSettings['homeLayout'])}><option value="cards">卡片</option><option value="compact">紧凑</option></select></label>
          <label className="check-choice"><input type="checkbox" checked={settings.homeShowUpdates} onChange={event => field('homeShowUpdates', event.target.checked)} />显示最近动态</label></div>
        <section className="home-section"><h3>工具中心内容</h3><p>名称、帮助、独立 SEO 与启停在工具配置中维护。</p><button type="button" onClick={()=>changeTab('tools')}>前往工具配置</button></section>
        <div className="form-actions"><button type="button" className="action-secondary" onClick={() => changeTab('modules')}>调整模块顺序与启停</button><button type="button" className="action-primary" onClick={() => void saveSite()}>保存首页设置</button></div>
      </section></fieldset>
      {preview && <section className="studio-card"><div className="card-heading"><h2>首页预览</h2><button type="button" className="action-secondary" onClick={() => setPhonePreview(!phonePreview)}>{phonePreview ? '桌面预览' : '手机预览'}</button></div><p>预览显示已经保存的公开首页。保存修改后刷新预览。</p><div className={'home-preview ' + (phonePreview ? 'phone-preview' : '')}><iframe key={JSON.stringify(savedSettings) + JSON.stringify(modules)} title="首页预览" src="/" /></div></section>}
    </>}
    {tab === 'seo' && <fieldset className="studio-fieldset studio-grid-two" disabled={locked}>
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
    {tab==='content'&&<fieldset className="studio-fieldset studio-grid-two" disabled={locked}>
      <section className="studio-card"><h2>博客数据与同步</h2><p>仅同步公开摘要，正文和文章编辑仍在博客。</p><p>数据来源：{contentData.source||'尚未配置公开博客地址'}</p><p>最近成功同步：{contentData.syncedAt?new Date(contentData.syncedAt).toLocaleString('zh-CN'):'尚未同步'}</p><p role="status">{contentData.error||({unconfigured:'数据源尚未配置',empty:'暂无公开摘要',ready:'缓存可用',stale:'缓存已过期，等待更新',error:'同步暂不可用'}[contentData.status])}</p>
        <label className="check-choice"><input type="checkbox" checked={modules.some(m=>m.id==='content'&&m.enabled)} onChange={()=>void toggleModule(modules.find(m=>m.id==='content')!)}/>启用博客动态</label>
        <button type="button" className="action-secondary" disabled={!modules.some(m=>m.id==='content'&&m.enabled)||contentData.status==='unconfigured'} onClick={()=>void perform(async()=>{const data=await api<{snapshot:ContentSnapshot}>('/api/studio/content','POST',{});setContentData(data.snapshot);if(data.snapshot.error)throw Error(data.snapshot.error)},'博客摘要已同步')}>{busy?'同步中…':'立即同步博客'}</button><p className="form-hint">访问首页时按需检查更新，间隔 15 分钟；失败后保留缓存并稍后重试。可在模块管理调整首页位置。</p>
      </section>
      <section className="studio-card"><h2>展示设置</h2><div className="form-stack"><label className="field"><span>博客区域标题</span><input maxLength={80} value={contentSettings.title} onChange={e=>setContentSettings({...contentSettings,title:e.target.value})}/></label><label className="field"><span>博客区域说明</span><textarea maxLength={300} value={contentSettings.description} onChange={e=>setContentSettings({...contentSettings,description:e.target.value})}/></label>
        <label className="field"><span>展示篇数</span><input type="number" min={1} max={12} value={contentSettings.limit} onChange={e=>setContentSettings({...contentSettings,limit:Number(e.target.value)})}/></label><label className="field"><span>文章卡片尺寸</span><select value={contentSettings.size} onChange={e=>setContentSettings({...contentSettings,size:e.target.value as ContentSettings['size']})}><option value="small">小卡片</option><option value="medium">中卡片</option><option value="large">大卡片</option></select></label><label className="field"><span>文章顺序</span><select value={contentSettings.order} onChange={e=>setContentSettings({...contentSettings,order:e.target.value as ContentSettings['order']})}><option value="newest">最新优先</option><option value="oldest">最早优先</option></select></label>
      </div></section>
      <section className="studio-card"><h2>分类筛选</h2><p className="form-hint">不选择则展示全部分类。筛选同样作用于综合 RSS。</p><div className="content-choices">{contentData.categories.map(c=><label className="check-choice" key={c.id}><input type="checkbox" checked={contentSettings.categoryIds.includes(c.id)} onChange={e=>setContentSettings({...contentSettings,categoryIds:e.target.checked?[...contentSettings.categoryIds,c.id]:contentSettings.categoryIds.filter(id=>id!==c.id)})}/>{c.name}</label>)}</div></section>
      <section className="studio-card"><h2>精选文章</h2><p className="form-hint">最多精选 12 篇，按选择顺序置顶；仍遵循分类筛选。</p><div className="content-choices">{contentData.posts.map(p=><label className="check-choice" key={p.id}><input type="checkbox" checked={contentSettings.featuredIds.includes(p.id)} onChange={e=>setContentSettings({...contentSettings,featuredIds:e.target.checked?[...contentSettings.featuredIds,p.id]:contentSettings.featuredIds.filter(id=>id!==p.id)})}/>{p.title}</label>)}</div></section>
      <div className="studio-form-bottom"><span className="draft-indicator">{contentDirty?'有未保存的修改':''}</span><button type="button" className="action-primary" onClick={()=>void perform(async()=>{const result=await api<{settings:ContentSettings}>('/api/studio/content','PUT',contentSettings);setContentSettings(result.settings);setSavedContentSettings(result.settings)},'博客展示设置已保存')}>保存博客展示</button></div>
    </fieldset>}
    {tab==='tools'&&<fieldset className="studio-fieldset studio-grid-two" disabled={locked}>{toolSettings.map(tool=><section className="studio-card" key={tool.id}><h2>{tool.id==='password'?'密码生成器':tool.id==='convert'?'文档转换':'IP 查询'}</h2><div className="form-stack"><label className="check-choice"><input type="checkbox" checked={tool.enabled} onChange={e=>setToolSettings(p=>p.map(t=>t.id===tool.id?{...t,enabled:e.target.checked}:t))}/>开放此工具</label>{(['title','description','seoTitle','seoDescription','help'] as const).map(key=><label className="field" key={key}><span>{{title:'工具名称',description:'工具说明',seoTitle:'SEO 标题',seoDescription:'SEO 描述',help:'帮助说明'}[key]}</span>{key==='help'||key==='description'||key==='seoDescription'?<textarea rows={key==='help'?5:2} maxLength={key==='help'?3000:500} value={tool[key]} onChange={e=>setToolSettings(p=>p.map(t=>t.id===tool.id?{...t,[key]:e.target.value}:t))}/>:<input maxLength={120} value={tool[key]} onChange={e=>setToolSettings(p=>p.map(t=>t.id===tool.id?{...t,[key]:e.target.value}:t))}/>}</label>)}</div></section>)}<div className="studio-form-bottom"><span className="draft-indicator">{toolsDirty?'有未保存的修改':''}</span><button className="action-primary" type="button" onClick={()=>void perform(async()=>{const result=await api<{tools:ToolSettings[]}>('/api/studio/tools','PUT',toolSettings);setToolSettings(result.tools);setSavedTools(result.tools)},'工具配置已保存')}>保存工具配置</button></div></fieldset>}
    {tab==='github'&&<fieldset className="studio-fieldset studio-grid-two" disabled={locked}><section className="studio-card"><h2>公开仓库与展示</h2><div className="form-stack"><label className="field"><span>GitHub 区域标题</span><input maxLength={80} value={githubSettings.title} onChange={e=>setGithubSettings({...githubSettings,title:e.target.value})}/></label><label className="field"><span>GitHub 区域说明</span><textarea maxLength={300} value={githubSettings.description} onChange={e=>setGithubSettings({...githubSettings,description:e.target.value})}/></label><label className="field"><span>公开仓库（每行 owner/repo）</span><textarea aria-label="公开仓库（每行 owner/repo）" rows={5} value={repoText} onChange={e=>setRepoText(e.target.value)}/></label></div><p className="form-hint">最多 4 个公开仓库，不接受网址或访问令牌；不自动修改项目的正式版本。</p><button className="action-primary" type="button" onClick={()=>void perform(async()=>{const result=await api<{settings:GithubSettings}>('/api/studio/github','PUT',{...githubSettings,repositories:repoText.split(/\r?\n/).map(r=>r.trim()).filter(Boolean)});setGithubSettings(result.settings);setSavedGithub(result.settings);setRepoText(result.settings.repositories.join('\n'))},'GitHub 配置已保存')}>保存 GitHub 配置</button></section><section className="studio-card"><h2>同步状态</h2><p>来源：GitHub 公开 API</p><p>最近成功同步：{githubData.syncedAt?new Date(githubData.syncedAt).toLocaleString('zh-CN'):'尚未同步'}</p><p role="status">{githubData.error||({unconfigured:'未选择仓库',empty:'尚无缓存',ready:'缓存可用',stale:'缓存已过期',error:'同步暂不可用'}[githubData.status])}</p><label className="check-choice"><input type="checkbox" checked={modules.some(m=>m.id==='github'&&m.enabled)} onChange={()=>void toggleModule(modules.find(m=>m.id==='github')!)}/>启用 GitHub 动态</label><button type="button" disabled={githubDirty||!githubSettings.repositories.length||!modules.some(m=>m.id==='github'&&m.enabled)} onClick={()=>void perform(async()=>{const result=await api<{snapshot:GithubSnapshot}>('/api/studio/github','POST',{});setGithubData(result.snapshot);if(result.snapshot.error||!result.snapshot.syncedAt)throw Error(result.snapshot.error||'配置已变化，请重新同步')},'GitHub 数据已同步')}>立即同步 GitHub</button><p className="form-hint">按需缓存 30 分钟，失败后至少等待 5 分钟再自动尝试。手动刷新也消耗匿名接口额度，请避免频繁操作。</p></section></fieldset>}
    {tab === 'modules' && <section className="studio-card"><div className="card-heading"><div><h2>模块管理</h2><p>启停、排序及首页区域尺寸会立即保存。外部数据卡片各自显示来源和同步状态。</p></div></div>
      <div className="module-list">{modules.map((module, index) => <div className="module-row" key={module.id}><div><strong>{module.name}</strong>
        <small>{module.summary} · 阶段 P{module.stage}</small></div><div className="module-actions">
        {['about','projects','games','tools','content','github'].includes(module.id)&&<select aria-label={'首页尺寸 '+module.name} disabled={locked} value={module.size} onChange={e=>void perform(async()=>{const result=await api<{modules:ModuleState[]}>('/api/studio/modules','PATCH',{id:module.id,size:e.target.value});setModules(result.modules)},'首页卡片尺寸已保存')}><option value="small">小区域</option><option value="medium">中区域</option><option value="large">大区域</option></select>}
        <button type="button" className="mini-arrow" disabled={locked || index === 0} onClick={() => void moveModule(index, -1)} aria-label={'上移 ' + module.name}>↑</button>
        <button type="button" className="mini-arrow" disabled={locked || index === modules.length - 1} onClick={() => void moveModule(index, 1)} aria-label={'下移 ' + module.name}>↓</button>
        <label className="check-choice"><input type="checkbox" disabled={locked || !module.available} checked={module.enabled} onChange={() => void toggleModule(module)} />
          <span>{module.available ? (module.enabled ? '开启' : '关闭') : '待开发'}</span></label>
      </div></div>)}</div></section>}
    {tab === 'system' && <div className="studio-grid-two"><section className="studio-card"><h2>当前开发状态</h2>
      <div className="placeholder-stack">主站内容与独立管理员后台</div><div className="placeholder-stack">数据：SQLite / WAL</div>
      <div className="placeholder-stack">账号、积分与游戏：后续阶段</div></section>
      <section className="studio-card"><h2>发布与备份</h2><p>上线前还需补齐媒体管理、备份恢复与旧站迁移验收。</p>
        <a className="subtle-link" href="/api/health" target="_blank" rel="noopener noreferrer">查看健康检查 ↗</a></section><MediaPanel /><BackupPanel /></div>}
  </main></div>
}
