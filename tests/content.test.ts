import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.HUB_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'hub-content-'))
let db: typeof import('../lib/db')
let validateSettingsPatch: typeof import('../lib/config').validateSettingsPatch
before(async () => {
  db = await import('../lib/db')
  validateSettingsPatch = (await import('../lib/config')).validateSettingsPatch
})

test('settings reject inherited keys and unsafe local URLs', () => {
  assert.throws(() => validateSettingsPatch({ constructor: 'bad' }))
  assert.throws(() => validateSettingsPatch({ avatarUrl: '/\\evil.example/x' }))
})

test('projects preserve presentation fields and old slug redirects without exposing drafts', () => {
  const p = db.createProject({
    slug: 'original',
    title: '测试项目',
    published: true,
    group: '纸牌',
    tags: ['多人'],
    screenshots: ['/assets/hearts-room.webp'],
    iconUrl: '/assets/favicon.svg',
    coverUrl: '/assets/hearts-art.webp',
    versionDate: '2026-10-11',
    versionSummary: '真实录入',
    maintenanceMessage: '维护说明',
    sortOrder: 2,
  })
  assert.equal((p as any).group, '纸牌')
  assert.deepEqual((p as any).screenshots, ['/assets/hearts-room.webp'])
  db.updateProject(p.id, { slug: 'renamed', status: 'maintenance' })
  assert.equal((db as any).getRedirectSlug('original'), 'renamed')
  assert.equal(db.getProjectBySlug('renamed')?.published, true)
  db.updateProject(p.id, { published: false })
  assert.equal((db as any).getRedirectSlug('original'), null)
})

test('project and game availability share one dependency rule', () => {
  db.setModuleEnabled('projects', false)
  assert.equal(db.isEnabled('games'), false)
  db.setModuleEnabled('projects', true)
  assert.equal(db.isEnabled('games'), true)
})

test('roadmap state and effective dates persist and invalid intervals are rejected', () => {
  const p = db.createProject({ slug: 'plan', title: '规划项目', published: true })
  const e = db.createEntry({
    projectId: p.id,
    title: '计划',
    type: 'roadmap',
    body: '逐步实施',
    published: true,
    roadmapStatus: 'in-progress',
    version: 'v2',
    effectiveFrom: '2026-10-10',
    effectiveUntil: '2026-10-12',
  })
  assert.equal((e as any).roadmapStatus, 'in-progress')
  assert.throws(() =>
    db.updateEntry(e.id, { effectiveFrom: '2026-10-13', effectiveUntil: '2026-10-12' }),
  )
})

test('core settings and projects persist in SQLite independently from unavailable extensions', () => {
  assert.throws(() => db.setModuleEnabled('accounts', true))
  db.updateSiteSettings({ displayName: '持久化姓名' })
  const json = (
    db.getDatabase().prepare('SELECT json FROM site_settings').get() as { json: string }
  ).json
  assert.equal(JSON.parse(json).displayName, '持久化姓名')
})

test('scheduled future entries do not crowd visible updates out of a limited feed', () => {
  const p = db.createProject({ slug: 'scheduled-feed', title: '定时公告测试', published: true })
  const visible = db.createEntry({
    projectId: p.id,
    type: 'changelog',
    title: '有效日志',
    body: '当前有效',
    published: true,
  })
  for (let i = 0; i < 5; i++)
    db.createEntry({
      projectId: p.id,
      type: 'notice',
      title: '未来公告 ' + i,
      body: '尚未生效',
      published: true,
      effectiveFrom: '9999-01-01',
    })
  assert.equal(db.recentPublicEntries(1)[0]?.id, visible.id)
})

test('deleting a published entry updates the project content timestamp', () => {
  const p = db.createProject({ slug: 'delete-entry-time', title: '删除日志时间', published: true })
  const entry = db.createEntry({
    projectId: p.id,
    type: 'changelog',
    title: '要删除的已发布日志',
    published: true,
  })
  db.getDatabase()
    .prepare('UPDATE projects SET content_updated_at=? WHERE id=?')
    .run('2000-01-01T00:00:00Z', p.id)
  db.deleteEntry(entry.id)
  assert.notEqual(db.getProjectById(p.id)?.contentUpdatedAt, '2000-01-01T00:00:00Z')
})
