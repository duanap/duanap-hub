'use client'

import { useMemo, useState } from 'react'
import type { EntryType, HubSettings, ModuleState, Project, ProjectEntry, ProjectCategory, ProjectStatus } from '@/lib/types'
import { ENTRY_LABELS, STATUS_LABELS } from '@/lib/types'

type Tab = 'overview' | 'projects' | 'site' | 'seo' | 'modules' | 'system'
const nav:[Tab,string][]=[['overview','概览'],['projects','项目与公告'],['site','主页资料'],['seo','SEO 与备案'],['modules','模块管理'],['system','系统信息']]
const blankProject={slug:'',title:'',summary:'',body:'',category:'website' as ProjectCategory,status:'development' as ProjectStatus,version:'',externalUrl:'',repositoryUrl:'',coverUrl:'',featured:false,published:false,seoTitle:'',seoDescription:''}
type ProjectDraft=typeof blankProject
const blankEntry={type:'changelog' as EntryType,title:'',body:'',published:false}
type EntryDraft=typeof blankEntry

async function api<T>(url:string,method:'POST'|'PUT'|'PATCH'|'DELETE',payload?:object):Promise<T>{
  const res=await fetch(url,{method,headers:{'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined})
  const data=await res.json().catch(()=>({error:'服务器返回了无效响应'}))
  if(res.status===401){window.location.assign('/duanap/login');throw new Error('会话已过期')}
  if(!res.ok)throw new Error(data.error||'操作失败')
  return data as T
}
function editableProject(p:Project):ProjectDraft{return {slug:p.slug,title:p.title,summary:p.summary,body:p.body,category:p.category,status:p.status,version:p.version,externalUrl:p.externalUrl,repositoryUrl:p.repositoryUrl,coverUrl:p.coverUrl,featured:p.featured,published:p.published,seoTitle:p.seoTitle,seoDescription:p.seoDescription}}

export function Studio({initialSettings,initialModules,initialProjects,initialEntries}:{initialSettings:HubSettings;initialModules:ModuleState[];initialProjects:Project[];initialEntries:ProjectEntry[]}){
  const [tab,setTab]=useState<Tab>('overview')
  const [settings,setSettings]=useState(initialSettings)
  const [modules,setModules]=useState(initialModules)
  const [projects,setProjects]=useState(initialProjects)
  const [entries,setEntries]=useState(initialEntries)
  const [activeProjectId,setActiveProjectId]=useState<number|null>(null)
  const [draft,setDraft]=useState<ProjectDraft>({...blankProject})
  const [projectEditorOpen,setProjectEditorOpen]=useState(false)
  const [entryDraft,setEntryDraft]=useState<EntryDraft>({...blankEntry})
  const [activeEntryId,setActiveEntryId]=useState<number|null>(null)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const selected=projects.find(p=>p.id===activeProjectId)
  const projectEntries=useMemo(()=>entries.filter(e=>e.projectId===activeProjectId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),[entries,activeProjectId])

  async function perform(action:()=>Promise<void>,message='已保存'){
    setBusy(true);setError('');setNotice('')
    try{await action();setNotice(message)}catch(e){setError(e instanceof Error?e.message:'操作失败')}
    finally{setBusy(false)}
  }
  function field<K extends keyof HubSettings>(key:K,value:HubSettings[K]){setSettings(old=>({...old,[key]:value}))}
  function editProject(p?:Project){setProjectEditorOpen(true);setActiveProjectId(p?.id??null);setDraft(p?editableProject(p):{...blankProject});setActiveEntryId(null);setEntryDraft({...blankEntry})}
  function chooseProject(p:Project){editProject(p)}

  const publishedCount=projects.filter(p=>p.published).length
  const activeCount=modules.filter(m=>m.enabled).length
  async function saveSite(){await perform(async()=>{const data=await api<{settings:HubSettings}>('/api/studio/site','PUT',settings);setSettings(data.settings)},'站点设置已保存')}
  async function saveProject(){
    await perform(async()=>{
      const url=activeProjectId?`/api/studio/projects/${activeProjectId}`:'/api/studio/projects'
      const data=await api<{project:Project;projects:Project[]}>(url,activeProjectId?'PATCH':'POST',draft)
      setProjects(data.projects);setActiveProjectId(data.project.id);setDraft(editableProject(data.project))
    },activeProjectId?'项目已更新':'项目已创建')
  }
  async function removeProject(){if(!activeProjectId||!window.confirm(`删除“${draft.title}”及其全部更新记录？此操作无法撤销。`))return
    await perform(async()=>{const data=await api<{projects:Project[]}>(`/api/studio/projects/${activeProjectId}`,'DELETE');setProjects(data.projects);setEntries(old=>old.filter(e=>e.projectId!==activeProjectId));setActiveProjectId(null);setProjectEditorOpen(false);setDraft({...blankProject})},'项目已删除')
  }
  async function saveEntry(){if(!activeProjectId)return
    await perform(async()=>{
      const url=activeEntryId?`/api/studio/entries/${activeEntryId}`:'/api/studio/entries'
      const payload=activeEntryId?entryDraft:{...entryDraft,projectId:activeProjectId}
      const data=await api<{entries:ProjectEntry[]}>(url,activeEntryId?'PATCH':'POST',payload)
      setEntries(old=>[...old.filter(e=>e.projectId!==activeProjectId),...data.entries]);setEntryDraft({...blankEntry});setActiveEntryId(null)
    },activeEntryId?'更新记录已修改':'更新记录已创建')
  }
  async function removeEntry(e:ProjectEntry){if(!window.confirm(`删除“${e.title}”？`))return
    await perform(async()=>{const data=await api<{entries:ProjectEntry[]}>(`/api/studio/entries/${e.id}`,'DELETE');setEntries(old=>[...old.filter(x=>x.projectId!==e.projectId),...data.entries])},'更新记录已删除')
  }
  async function toggleModule(m:ModuleState){
    await perform(async()=>{const data=await api<{modules:ModuleState[]}>('/api/studio/modules','PATCH',{id:m.id,enabled:!m.enabled});setModules(data.modules)},m.enabled?'模块已关闭':'模块已启用')
  }
  async function moveModule(index:number,dir:-1|1){
    const values=[...modules];const next=index+dir;if(next<0||next>=values.length)return
    ;[values[index],values[next]]=[values[next],values[index]]
    await perform(async()=>{const data=await api<{modules:ModuleState[]}>('/api/studio/modules','PATCH',{order:values.map(m=>m.id)});setModules(data.modules)},'排序已保存')
  }
  async function logout(){await perform(async()=>{await api('/api/studio/logout','POST');window.location.assign('/duanap/login')},'')}
  const input=(label:string,key:keyof HubSettings,placeholder='')=><label className="field" key={key}><span>{label}</span><input value={String(settings[key])} placeholder={placeholder} onChange={e=>field(key,e.target.value as HubSettings[typeof key])}/></label>

  return <div className="studio-root"><aside className="studio-sidebar">
    <div className="studio-brand"><span className="brand-icon">d.</span><div><strong>duanap Studio</strong><small>个人网站管理</small></div></div>
    <div className="studio-sidebar-label">工作台</div>
    <nav className="studio-nav">{nav.map(([id,label])=><button key={id} className={tab===id?'selected':''} type="button" onClick={()=>{setTab(id);setNotice('');setError('')}}>{label}</button>)}</nav>
    <div className="studio-sidebar-bottom"><a href="/" target="_blank" rel="noopener noreferrer">打开网站 ↗</a><button type="button" onClick={()=>void logout()}>退出登录</button></div>
  </aside>
  <main className="studio-main">
    <header className="studio-top"><div><span className="eyebrow">DUANAP / STUDIO</span><h1>{nav.find(([id])=>id===tab)?.[1]}</h1><p>第一阶段开发骨架 · v0.1.0</p></div><div className="studio-top-actions"><a className="action-secondary" href="/" target="_blank" rel="noopener noreferrer">预览网站 ↗</a></div></header>
    {error&&<div className="error-banner" role="alert">{error}</div>}{notice&&<div className="success-banner" role="status">{notice}</div>}
    {tab==='overview'&&<>
      <div className="studio-metrics"><div className="metric-tile"><span>项目总数</span><strong>{projects.length}</strong><small>含草稿</small></div><div className="metric-tile"><span>已发布项目</span><strong>{publishedCount}</strong><small>当前公开</small></div><div className="metric-tile"><span>启用模块</span><strong>{activeCount}</strong><small>内置注册模块</small></div><div className="metric-tile"><span>已发布动态</span><strong>{entries.filter(e=>e.published).length}</strong><small>更新日志及公告</small></div></div>
      <div className="studio-grid-two"><section className="studio-card"><h2>快捷操作</h2><div className="quick-grid"><button onClick={()=>{setTab('projects');editProject()}}>新增项目 <span>↗</span></button><button onClick={()=>setTab('site')}>编辑主页 <span>↗</span></button><button onClick={()=>setTab('modules')}>管理模块 <span>↗</span></button><button onClick={()=>setTab('seo')}>搜索设置 <span>↗</span></button></div></section>
        <section className="studio-card"><h2>外部数据接入</h2><div className="placeholder-stack">WordPress 会员与积分 · P2</div><div className="placeholder-stack">EdgeOne / 博客数据 · P3</div><div className="placeholder-stack">游戏数据与 QQ 机器人 · P3</div><p className="form-hint">扩展组件独立接入，不影响主站启动。</p></section></div>
    </>}
    {tab==='projects'&&<>
      <section className="studio-card"><div className="card-heading"><div><h2>项目与作品</h2><p>状态、当前版本和公告均由你手动维护。</p></div><button type="button" className="action-primary" onClick={()=>editProject()}>+ 新增项目</button></div>
        {projects.length?<div className="studio-project-grid">{projects.map(p=><button type="button" key={p.id} className={`studio-project ${activeProjectId===p.id&&projectEditorOpen?'active':''}`} onClick={()=>chooseProject(p)}><span className="studio-project-head"><strong>{p.title}</strong><span>{p.published?'已发布':'草稿'}</span></span><small>{p.summary||'暂无简介'}</small><span className="studio-project-meta"><span>{STATUS_LABELS[p.status]}</span><span>{p.version||'未设版本'}</span></span></button>)}</div>:<p className="form-hint">还没有项目。新建项目默认是草稿。</p>}</section>
      {projectEditorOpen&&<section className="studio-card"><div className="card-heading"><div><h2>{selected?`编辑：${selected.title}`:'创建新项目'}</h2><p>项目详情、SEO、版本与运营状态。</p></div><button className="text-action" onClick={()=>setProjectEditorOpen(false)}>收起编辑器</button></div>
        <div className="form-columns"><label className="field"><span>项目名称</span><input value={draft.title} maxLength={100} onChange={e=>setDraft(v=>({...v,title:e.target.value}))}/></label>
        <label className="field"><span>URL 标识（slug）</span><input value={draft.slug} placeholder="hearts" onChange={e=>setDraft(v=>({...v,slug:e.target.value.toLowerCase()}))}/></label>
        <label className="field"><span>项目类别</span><select value={draft.category} onChange={e=>setDraft(v=>({...v,category:e.target.value as ProjectCategory}))}>{[['website','网站/应用'],['game','小游戏'],['tool','工具'],['other','其他']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>手动运营状态</span><select value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value as ProjectStatus}))}>{Object.entries(STATUS_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field"><span>当前版本</span><input value={draft.version} onChange={e=>setDraft(v=>({...v,version:e.target.value}))} placeholder="v1.0.0"/></label>
        <label className="field"><span>在线地址</span><input value={draft.externalUrl} onChange={e=>setDraft(v=>({...v,externalUrl:e.target.value}))} placeholder="https://..."/></label>
        <label className="field"><span>仓库地址</span><input value={draft.repositoryUrl} onChange={e=>setDraft(v=>({...v,repositoryUrl:e.target.value}))} placeholder="https://github.com/..."/></label>
        <label className="field"><span>封面图片地址</span><input value={draft.coverUrl} onChange={e=>setDraft(v=>({...v,coverUrl:e.target.value}))} placeholder="https://..."/></label>
        <label className="field span-two"><span>项目摘要</span><textarea rows={2} value={draft.summary} onChange={e=>setDraft(v=>({...v,summary:e.target.value}))}/></label>
        <label className="field span-two"><span>项目介绍（Markdown）</span><textarea rows={6} value={draft.body} onChange={e=>setDraft(v=>({...v,body:e.target.value}))}/></label>
        <label className="field"><span>独立 SEO 标题（可选）</span><input value={draft.seoTitle} onChange={e=>setDraft(v=>({...v,seoTitle:e.target.value}))}/></label>
        <label className="field"><span>SEO 描述（可选）</span><input value={draft.seoDescription} onChange={e=>setDraft(v=>({...v,seoDescription:e.target.value}))}/></label>
        </div>
        <div className="form-actions"><label className="check-choice"><input type="checkbox" checked={draft.published} onChange={e=>setDraft(v=>({...v,published:e.target.checked}))}/>公开发布</label><label className="check-choice"><input type="checkbox" checked={draft.featured} onChange={e=>setDraft(v=>({...v,featured:e.target.checked}))}/>首页精选</label><button disabled={busy} className="action-primary" type="button" onClick={()=>void saveProject()}>保存项目</button>{activeProjectId&&<button disabled={busy} className="text-action destructive" onClick={()=>void removeProject()}>删除项目</button>}</div>
      </section>}
      {activeProjectId&&projectEditorOpen&&<section className="studio-card"><div className="card-heading"><div><h2>更新日志与公告</h2><p>每条记录都可以单独作为草稿或发布；草稿不会进入 RSS。</p></div></div>
        {projectEntries.length>0&&<div className="admin-entry-list">{projectEntries.map(e=><div key={e.id} className="admin-entry"><div><strong>{e.title}</strong><small>{ENTRY_LABELS[e.type]} · {e.published?'已发布':'草稿'}</small></div><div className="entry-actions"><button onClick={()=>{setActiveEntryId(e.id);setEntryDraft({type:e.type,title:e.title,body:e.body,published:e.published})}}>编辑</button><button className="destructive" onClick={()=>void removeEntry(e)}>删除</button></div></div>)}</div>}
        <div className="form-columns"><label className="field"><span>内容类型</span><select value={entryDraft.type} onChange={e=>setEntryDraft(v=>({...v,type:e.target.value as EntryType}))}>{Object.entries(ENTRY_LABELS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field"><span>标题</span><input value={entryDraft.title} onChange={e=>setEntryDraft(v=>({...v,title:e.target.value}))} placeholder="下一版本计划"/></label>
        <label className="field span-two"><span>正文（Markdown）</span><textarea rows={5} value={entryDraft.body} onChange={e=>setEntryDraft(v=>({...v,body:e.target.value}))}/></label></div>
        <div className="form-actions"><label className="check-choice"><input type="checkbox" checked={entryDraft.published} onChange={e=>setEntryDraft(v=>({...v,published:e.target.checked}))}/>公开发布</label><button className="action-primary" disabled={busy} onClick={()=>void saveEntry()}>{activeEntryId?'更新记录':'新增记录'}</button>{activeEntryId&&<button className="text-action" onClick={()=>{setActiveEntryId(null);setEntryDraft({...blankEntry})}}>取消编辑</button>}</div>
      </section>}
    </>}
    {tab==='site'&&<div className="studio-grid-two"><section className="studio-card"><h2>基本资料</h2><div className="form-stack">{input('网站名称','siteName')}{input('昵称','displayName')}{input('一句话介绍','tagline')}<label className="field"><span>个人介绍（Markdown）</span><textarea rows={8} value={settings.biography} onChange={e=>field('biography',e.target.value)}/></label></div></section>
      <section className="studio-card"><h2>社交与联系</h2><div className="form-stack">{input('GitHub 地址','githubUrl')}{input('公开邮箱','publicEmail')}{input('头像图片地址','avatarUrl')}{input('版权署名','copyright')}</div></section><div className="studio-form-bottom"><button className="action-primary" disabled={busy} onClick={()=>void saveSite()}>保存站点资料</button></div></div>}
    {tab==='seo'&&<div className="studio-grid-two"><section className="studio-card"><h2>SEO 基础设置</h2><div className="form-stack">{input('首页搜索标题','seoTitle')}<label className="field"><span>首页描述</span><textarea rows={4} value={settings.seoDescription} onChange={e=>field('seoDescription',e.target.value)}/></label><label className="check-choice"><input type="checkbox" checked={settings.seoIndexable} onChange={e=>field('seoIndexable',e.target.checked)}/>允许公开页面收录</label></div><p className="form-hint">项目独立的 SEO 信息在项目编辑页设置。</p></section>
      <section className="studio-card"><h2>备案与页脚</h2><div className="form-stack">{input('ICP备案号','icpNumber')}{input('ICP 地址','icpUrl')}{input('公安备案号','policeNumber')}{input('公安备案 URL','policeUrl')}</div></section>
      <section className="studio-card"><h2>爬虫与 RSS</h2><div className="quick-grid"><a href="/robots.txt" target="_blank" rel="noopener noreferrer">robots.txt ↗</a><a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">sitemap.xml ↗</a><a href="/feed.xml" target="_blank" rel="noopener noreferrer">feed.xml ↗</a></div></section><div className="studio-form-bottom"><button className="action-primary" disabled={busy} onClick={()=>void saveSite()}>保存 SEO 与备案</button></div></div>}
    {tab==='modules'&&<section className="studio-card"><div className="card-heading"><div><h2>运行时模块管理</h2><p>第一阶段只启用已实现模块；未来功能保持关闭，直到代码接入。</p></div></div><div className="module-list">{modules.map((m,i)=><div className="module-row" key={m.id}><div><strong>{m.name}</strong><small>{m.summary} · 阶段 P{m.stage}</small></div><div className="module-actions"><button className="mini-arrow" disabled={busy||i===0} onClick={()=>void moveModule(i,-1)} aria-label={`上移 ${m.name}`}>↑</button><button className="mini-arrow" disabled={busy||i===modules.length-1} onClick={()=>void moveModule(i,1)} aria-label={`下移 ${m.name}`}>↓</button><label className="check-choice"><input type="checkbox" disabled={busy||!m.available} checked={m.enabled} onChange={()=>void toggleModule(m)}/><span>{m.available?(m.enabled?'开启':'关闭'):'待开发'}</span></label></div></div>)}</div><p className="form-hint">关闭模块会影响导航、页面和 Sitemap；与服务器实时更新代码不是同一概念。</p></section>}
    {tab==='system'&&<div className="studio-grid-two"><section className="studio-card"><h2>当前开发状态</h2><p>独立项目的第一阶段开发骨架。</p><div className="placeholder-stack">核心运行时：Next.js + Node.js 22</div><div className="placeholder-stack">主站数据：SQLite / WAL</div><div className="placeholder-stack">用户积分与游戏数据：后续阶段接入</div></section><section className="studio-card"><h2>发布与备份</h2><p>上线前必须先补充生产备份、媒体管理、旧站迁移与回滚演练。</p><a className="subtle-link" href="/api/health" target="_blank" rel="noopener noreferrer">查看健康检查 ↗</a></section></div>}
  </main></div>
}
