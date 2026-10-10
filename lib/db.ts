import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, validateSettingsPatch } from '@/lib/config'
import { REGISTERED_MODULES, isModuleId } from '@/lib/modules'
import type { EntryType, HubSettings, ModuleId, ModuleState, Project, ProjectCategory, ProjectEntry, ProjectStatus } from '@/lib/types'

const folder = path.resolve(process.env.HUB_DATA_DIR || path.join(process.cwd(), 'data'))
let singleton: Database.Database | null = null

export function getDatabase() {
  if (singleton) return singleton
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const db = new Database(path.join(folder, 'hub.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS module_settings (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'website',
      status TEXT NOT NULL DEFAULT 'development',
      version TEXT NOT NULL DEFAULT '',
      external_url TEXT NOT NULL DEFAULT '',
      repository_url TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
      published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0,1)),
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_published ON projects(published, category, updated_at);
    CREATE INDEX IF NOT EXISTS idx_entries_public ON project_entries(published, published_at);
  `)
  db.prepare('INSERT OR IGNORE INTO site_settings (id, json) VALUES (1, ?)').run(JSON.stringify(DEFAULT_SETTINGS))
  singleton = db
  return db
}

export function getSiteSettings(): HubSettings {
  const row = getDatabase().prepare('SELECT json FROM site_settings WHERE id = 1').get() as { json: string }
  try {
    const parsed = JSON.parse(row.json) as Partial<HubSettings>
    return { ...DEFAULT_SETTINGS, ...validateSettingsPatch(parsed) }
  } catch {
    return DEFAULT_SETTINGS
  }
}
export function updateSiteSettings(patch: Partial<HubSettings>): HubSettings {
  const settings = { ...getSiteSettings(), ...validateSettingsPatch(patch) }
  getDatabase().prepare('UPDATE site_settings SET json = ? WHERE id = 1').run(JSON.stringify(settings))
  return settings
}

export function getModules(): ModuleState[] {
  const overrides = getDatabase().prepare('SELECT id, enabled, sort_order FROM module_settings').all() as {id:string;enabled:number;sort_order:number}[]
  const states = REGISTERED_MODULES.map((m, i) => {
    const row = overrides.find(v => v.id === m.id)
    return { ...m, enabled: m.available && (row ? Boolean(row.enabled) : m.defaultEnabled), sortOrder: row?.sort_order ?? i }
  })
  return states.sort((a,b) => a.sortOrder - b.sortOrder)
}
export function isEnabled(id: ModuleId): boolean {
  return getModules().some(m => m.id === id && m.enabled && m.available)
}
export function setModuleEnabled(id: string, enabled: boolean) {
  if (!isModuleId(id)) throw new Error('未知模块')
  const definition = REGISTERED_MODULES.find(m => m.id === id)!
  if (!definition.available && enabled) throw new Error('该模块尚未实现，暂无法启用')
  const current = getModules().find(m => m.id === id)!
  getDatabase().prepare(`INSERT INTO module_settings (id, enabled, sort_order, updated_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at`)
    .run(id, enabled ? 1 : 0, current.sortOrder, new Date().toISOString())
  return getModules()
}
export function reorderModules(ids: string[]) {
  const keys = REGISTERED_MODULES.map(m=>m.id)
  if (ids.length !== keys.length || new Set(ids).size !== keys.length || ids.some(id=>!isModuleId(id))) throw new Error('模块排序数据不完整')
  const now = new Date().toISOString()
  const db = getDatabase()
  db.transaction(()=>{
    ids.forEach((id, idx)=> {
      const old = getModules().find(m=>m.id===id)!
      db.prepare(`INSERT INTO module_settings (id, enabled, sort_order, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET sort_order=excluded.sort_order, updated_at=excluded.updated_at`)
        .run(id, old.enabled?1:0,idx,now)
    })
  })()
  return getModules()
}

type ProjectRow = {
  id:number;slug:string;title:string;summary:string;body:string;category:ProjectCategory;status:ProjectStatus;version:string;
  external_url:string;repository_url:string;cover_url:string;featured:number;published:number;seo_title:string;seo_description:string;
  created_at:string;updated_at:string
}
function toProject(row: ProjectRow): Project {
  return {id:row.id, slug:row.slug, title:row.title, summary:row.summary, body:row.body, category:row.category,
    status:row.status, version:row.version, externalUrl:row.external_url, repositoryUrl:row.repository_url,
    coverUrl:row.cover_url, featured:!!row.featured, published:!!row.published,
    seoTitle:row.seo_title, seoDescription:row.seo_description, createdAt:row.created_at, updatedAt:row.updated_at}
}
export function listProjects(options:{publishedOnly?:boolean;category?:ProjectCategory;limit?:number} = {}): Project[] {
  const conditions:string[] = []
  const args:(string|number)[]=[]
  if(options.publishedOnly){conditions.push('published = 1')}
  if(options.category){conditions.push('category = ?');args.push(options.category)}
  const filter=conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const max = Math.max(1,Math.min(100,options.limit||100))
  const rows=getDatabase().prepare(`SELECT * FROM projects ${filter} ORDER BY featured DESC, updated_at DESC, id DESC LIMIT ?`).all(...args,max) as ProjectRow[]
  return rows.map(toProject)
}
export function getProjectBySlug(slug:string, publishedOnly=true):Project|null {
  const row = getDatabase().prepare(`SELECT * FROM projects WHERE slug = ? ${publishedOnly?'AND published = 1':''} LIMIT 1`).get(slug) as ProjectRow|undefined
  return row ? toProject(row):null
}
export function getProjectById(id:number):Project|null {
  const row=getDatabase().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow|undefined
  return row ? toProject(row):null
}

const categories=['website','game','tool','other']
const statuses=['development','online','maintenance','paused','archived']
const projectFields=['slug','title','summary','body','category','status','version','externalUrl','repositoryUrl','coverUrl','featured','published','seoTitle','seoDescription'] as const
function urlOk(s:string) {if(!s)return true;try{return ['http:','https:'].includes(new URL(s).protocol)}catch{return false}}
export function validateProject(value:unknown,creating=false):Record<string,string|boolean> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('项目内容无效')
  const raw=value as Record<string,unknown>
  const result:Record<string,string|boolean>={}
  for(const [key,v] of Object.entries(raw)){
    if(!projectFields.includes(key as typeof projectFields[number]))throw new Error(`未知项目字段：${key}`)
    if(key==='published'||key==='featured'){
      if(typeof v!=='boolean')throw new Error(`${key} 必须是布尔值`)
      result[key]=v;continue
    }
    if(typeof v!=='string'||v.length>(key==='body'?30000:1200))throw new Error(`${key} 内容过长或类型错误`)
    const text=v.trim()
    if(key==='slug'&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text))throw new Error('slug 只能包含小写英文字母、数字和短横线')
    if(key==='title'&&(!text||text.length>100))throw new Error('标题长度无效')
    if(key==='category'&&!categories.includes(text))throw new Error('未知项目分类')
    if(key==='status'&&!statuses.includes(text))throw new Error('未知项目状态')
    if(['externalUrl','repositoryUrl','coverUrl'].includes(key)&&!urlOk(text))throw new Error(`${key} 必须是完整 HTTP(S) 链接`)
    result[key]=text
  }
  if(creating&&(!result.slug||!result.title))throw new Error('新增项目必须填写 slug 与标题')
  return result
}
const columns:Record<string,string>={slug:'slug',title:'title',summary:'summary',body:'body',category:'category',status:'status',
  version:'version',externalUrl:'external_url',repositoryUrl:'repository_url',coverUrl:'cover_url',featured:'featured',
  published:'published',seoTitle:'seo_title',seoDescription:'seo_description'}
function toSqlValues(p:Record<string,string|boolean>){return Object.fromEntries(Object.entries(p).map(([k,v])=>[columns[k],typeof v==='boolean'?Number(v):v]))}
export function createProject(payload:unknown):Project {
  const input=toSqlValues(validateProject(payload,true))
  const now=new Date().toISOString()
  const keys=Object.keys(input)
  const statement=`INSERT INTO projects (${keys.join(',')}, created_at, updated_at) VALUES (${keys.map(()=>'?').join(',')}, ?, ?)`
  const result=getDatabase().prepare(statement).run(...Object.values(input),now,now)
  return getProjectById(Number(result.lastInsertRowid))!
}
export function updateProject(id:number,payload:unknown):Project {
  const prev=getProjectById(id);if(!prev)throw new Error('项目不存在')
  const input=toSqlValues(validateProject(payload));const keys=Object.keys(input)
  if(!keys.length)return prev
  getDatabase().prepare(`UPDATE projects SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=? WHERE id=?`).run(...Object.values(input),new Date().toISOString(),id)
  return getProjectById(id)!
}
export function deleteProject(id:number):void{
  if(!getProjectById(id))throw new Error('项目不存在')
  getDatabase().prepare('DELETE FROM projects WHERE id=?').run(id)
}

type EntryRow = {id:number;project_id:number;type:EntryType;title:string;body:string;published:number;published_at:string|null;created_at:string;updated_at:string}
function toEntry(r:EntryRow):ProjectEntry{return {id:r.id,projectId:r.project_id,type:r.type,title:r.title,body:r.body,published:!!r.published,publishedAt:r.published_at,createdAt:r.created_at,updatedAt:r.updated_at}}
export function getProjectEntries(projectId:number,publishedOnly=false):ProjectEntry[]{
  const r=getDatabase().prepare(`SELECT * FROM project_entries WHERE project_id=? ${publishedOnly?'AND published=1':''} ORDER BY COALESCE(published_at,created_at) DESC,id DESC`).all(projectId) as EntryRow[]
  return r.map(toEntry)
}
export type PublicEntry = ProjectEntry & { projectSlug:string;projectTitle:string }
export function recentPublicEntries(limit=20):PublicEntry[]{
  const rows=getDatabase().prepare(`SELECT e.*,p.slug AS project_slug,p.title AS project_title FROM project_entries e
    JOIN projects p ON p.id=e.project_id WHERE e.published=1 AND p.published=1
    ORDER BY e.published_at DESC,e.id DESC LIMIT ?`).all(Math.max(1,Math.min(limit,100))) as (EntryRow&{project_slug:string;project_title:string})[]
  return rows.map(r=>({...toEntry(r),projectSlug:r.project_slug,projectTitle:r.project_title}))
}
const entryTypes=['changelog','preview','notice','roadmap','rules']
export function validateEntry(value:unknown,create=false){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('公告内容无效')
  const p=value as Record<string,unknown>;const allowed=['projectId','type','title','body','published']
  const result:Record<string,string|boolean|number>={}
  for(const [k,v] of Object.entries(p)){
    if(!allowed.includes(k))throw new Error(`未知公告字段：${k}`)
    if(k==='projectId'){
      if(!Number.isInteger(v)||Number(v)<=0)throw new Error('项目 ID 无效')
      result.projectId=Number(v)
    }else if(k==='published'){
      if(typeof v!=='boolean')throw new Error('published 必须是布尔值')
      result.published=v
    }else{
      if(typeof v!=='string'||v.length>(k==='body'?20000:180))throw new Error(`${k} 无效`)
      if(k==='type'&&!entryTypes.includes(v))throw new Error('类型无效')
      if(k==='title'&&!v.trim())throw new Error('标题不能为空')
      result[k]=v.trim()
    }
  }
  if(create&&(!result.projectId||!result.title||!result.type))throw new Error('缺少公告基础信息')
  return result
}
export function createEntry(payload:unknown):ProjectEntry{
  const p=validateEntry(payload,true)
  const projectId=Number(p.projectId)
  if(!getProjectById(projectId))throw new Error('项目不存在')
  const now=new Date().toISOString()
  const result=getDatabase().prepare(`INSERT INTO project_entries(project_id,type,title,body,published,published_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(projectId,String(p.type),String(p.title),String(p.body||''),p.published?1:0,p.published?now:null,now,now)
  return getEntryById(Number(result.lastInsertRowid))!
}
export function getEntryById(id:number):ProjectEntry|null{
  const r=getDatabase().prepare('SELECT * FROM project_entries WHERE id=?').get(id) as EntryRow|undefined
  return r?toEntry(r):null
}
export function updateEntry(id:number,payload:unknown):ProjectEntry{
  const old=getEntryById(id);if(!old)throw new Error('公告不存在')
  const p=validateEntry(payload)
  if(p.projectId!==undefined&&Number(p.projectId)!==old.projectId)throw new Error('公告不能跨项目迁移')
  const next={type:String(p.type??old.type),title:String(p.title??old.title),body:String(p.body??old.body),published:p.published===undefined?old.published:Boolean(p.published)}
  const at=next.published?(old.publishedAt||new Date().toISOString()):null
  getDatabase().prepare('UPDATE project_entries SET type=?,title=?,body=?,published=?,published_at=?,updated_at=? WHERE id=?')
   .run(next.type,next.title,next.body,next.published?1:0,at,new Date().toISOString(),id)
  return getEntryById(id)!
}
export function deleteEntry(id:number){if(!getEntryById(id))throw new Error('公告不存在');getDatabase().prepare('DELETE FROM project_entries WHERE id=?').run(id)}
