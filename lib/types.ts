export type ProjectCategory = 'website' | 'game' | 'tool' | 'other'
export type ProjectStatus = 'development' | 'online' | 'maintenance' | 'paused' | 'archived'
export type EntryType = 'changelog' | 'preview' | 'notice' | 'roadmap' | 'rules'
export type RoadmapStatus = 'idea' | 'planned' | 'in-progress' | 'done' | 'paused'

export type HubSettings = {
  siteName: string
  displayName: string
  tagline: string
  biography: string
  publicEmail: string
  githubUrl: string
  avatarUrl: string
  seoTitle: string
  seoDescription: string
  seoIndexable: boolean
  icpNumber: string
  icpUrl: string
  policeNumber: string
  policeUrl: string
  copyright: string
  homeProjectsLimit: number
  homeShowUpdates: boolean
  homeLayout: 'cards' | 'compact'
  socialLinks: { label: string; url: string }[]
  passwordToolTitle: string
  passwordToolDescription: string
}

export type ModuleId = 'about' | 'projects' | 'games' | 'tools' | 'content' | 'accounts' | 'edgeone' | 'github'
export type ModuleDefinition = {
  id: ModuleId
  name: string
  summary: string
  stage: 1 | 2 | 3
  defaultEnabled: boolean
  available: boolean
}
export type ModuleState = ModuleDefinition & { enabled: boolean; sortOrder: number;size:'small'|'medium'|'large' }

export type Project = {
  id: number
  slug: string
  title: string
  summary: string
  body: string
  category: ProjectCategory
  status: ProjectStatus
  version: string
  externalUrl: string
  repositoryUrl: string
  coverUrl: string
  iconUrl: string
  groupName: string
  tags: string[]
  screenshots: string[]
  versionDate: string
  sortOrder: number
  featured: boolean
  published: boolean
  seoTitle: string
  seoDescription: string
  createdAt: string
  updatedAt: string
}
export type ProjectEntry = {
  id: number
  projectId: number
  type: EntryType
  title: string
  body: string
  published: boolean
  publishedAt: string | null
  roadmapStatus: RoadmapStatus
  version: string
  effectiveAt: string
  createdAt: string
  updatedAt: string
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  development: '开发中',
  online: '正常开放',
  maintenance: '维护中',
  paused: '暂停开放',
  archived: '停止维护'
}

export const ENTRY_LABELS: Record<EntryType, string> = {
  changelog: '更新日志',
  preview: '版本预告',
  notice: '维护公告',
  roadmap: '开发路线图',
  rules: '玩法与说明'
}
export const ROADMAP_LABELS: Record<RoadmapStatus, string> = {
  idea: '想法', planned: '计划中', 'in-progress': '开发中', done: '已完成', paused: '搁置',
}
