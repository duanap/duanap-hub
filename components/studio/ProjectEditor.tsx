'use client'
import { useEffect, useState } from 'react'
import type { Project, ProjectEntry, ProjectCategory, ProjectStatus, EntryType } from '@/lib/types'
import { STATUS_LABELS, ENTRY_LABELS } from '@/lib/types'
import { studioApi } from './client'
import { useUnsaved } from './useUnsaved'
import { MediaField } from './MediaField'
type Draft = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'contentUpdatedAt'>
const blank: Draft = {
  slug: '',
  title: '',
  summary: '',
  body: '',
  category: 'website',
  status: 'development',
  version: '',
  externalUrl: '',
  repositoryUrl: '',
  coverUrl: '',
  featured: false,
  published: false,
  seoTitle: '',
  seoDescription: '',
  iconUrl: '',
  group: '',
  tags: [],
  screenshots: [],
  sortOrder: 0,
  versionDate: '',
  versionSummary: '',
  maintenanceMessage: '',
  allowEntryDuringMaintenance: false,
}
type EntryDraft = Omit<ProjectEntry, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'publishedAt'>
const blankEntry: EntryDraft = {
  type: 'changelog',
  title: '',
  body: '',
  published: false,
  version: '',
  roadmapStatus: 'planned',
  effectiveFrom: '',
  effectiveUntil: '',
  expectedAt: '',
}
function edit(p: Project): Draft {
  const { id, createdAt, updatedAt, contentUpdatedAt, ...draft } = p
  return draft
}
function editEntry(p: ProjectEntry): EntryDraft {
  const { id, projectId, createdAt, updatedAt, publishedAt, ...draft } = p
  return draft
}
export function ProjectEditor({
  project,
  initialEntries,
  onDirty,
  onSaved,
  onDeleted,
}: {
  project?: Project
  initialEntries: ProjectEntry[]
  onDirty: (v: boolean) => void
  onSaved: (p: Project) => void
  onDeleted: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => (project ? edit(project) : { ...blank })),
    [entries, setEntries] = useState(initialEntries),
    [entry, setEntry] = useState<EntryDraft>({ ...blankEntry }),
    [entryId, setEntryId] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [pDirty, setPDirty] = useState(false),
    [eDirty, setEDirty] = useState(false)
  const pGuard = useUnsaved(draft, setPDirty, {
      key: 'project:' + (project?.id ?? 'new'),
      restore: setDraft,
    }),
    eGuard = useUnsaved(entry, setEDirty, {
      key: 'entry:' + (project?.id ?? 'new') + ':' + (entryId ?? 'new'),
      restore: setEntry,
    })
  useEffect(() => {
    onDirty(pDirty || eDirty)
  }, [pDirty, eDirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])
  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((old) => ({ ...old, [key]: value }))
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true)
    setNotice('')
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    await perform(async () => {
      const r = await studioApi<{ project: Project }>(
        project ? '/api/studio/projects/' + project.id : '/api/studio/projects',
        project ? 'PATCH' : 'POST',
        draft,
      )
      setDraft(edit(r.project))
      pGuard.markSaved(edit(r.project))
      setNotice('项目已保存')
      onSaved(r.project)
    })
  }
  async function remove() {
    if (!project || !confirm('永久删除“' + project.title + '”及全部更新记录？此操作无法撤销。'))
      return
    await perform(async () => {
      await studioApi('/api/studio/projects/' + project.id, 'DELETE')
      onDeleted()
    })
  }
  function choose(e?: ProjectEntry) {
    if (eGuard.dirty && !confirm('当前记录尚未保存，确认切换？')) return
    const next = e ? editEntry(e) : { ...blankEntry }
    setEntry(next)
    eGuard.markSaved(next)
    setEntryId(e?.id ?? null)
  }
  async function saveEntry() {
    if (!project) return
    await perform(async () => {
      const r = await studioApi<{ entries: ProjectEntry[] }>(
        entryId ? '/api/studio/entries/' + entryId : '/api/studio/entries',
        entryId ? 'PATCH' : 'POST',
        entryId ? entry : { ...entry, projectId: project.id },
      )
      setEntries(r.entries)
      setEntry({ ...blankEntry })
      eGuard.markSaved(blankEntry)
      setEntryId(null)
      setNotice('更新记录已保存')
    })
  }
  async function deleteEntry(id: number) {
    if (!confirm('永久删除这条记录？')) return
    await perform(async () => {
      const r = await studioApi<{ entries: ProjectEntry[] }>('/api/studio/entries/' + id, 'DELETE')
      setEntries(r.entries)
      if (entryId === id) {
        setEntry({ ...blankEntry })
        eGuard.markSaved(blankEntry)
        setEntryId(null)
      }
      setNotice('记录已删除')
    })
  }
  const input = (label: string, key: keyof Draft, type = 'text') => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={String(draft[key])}
        onChange={(e) =>
          field(key, (type === 'number' ? Number(e.target.value) : e.target.value) as never)
        }
      />
    </label>
  )
  return (
    <div className="editor-stack">
      {(pGuard.restored || eGuard.restored) && (
        <p className="form-hint">已恢复当前标签页的未保存草稿，请核对后保存。</p>
      )}
      {(pGuard.cacheError || eGuard.cacheError) && (
        <p className="error-banner">临时草稿缓存不可用，请保存后再离开。</p>
      )}
      <header className="editor-heading">
        <div>
          <p className="eyebrow">作品与运营</p>
          <h1>{project ? '编辑：' + project.title : '创建新项目'}</h1>
          <p className="muted">发布、版本与运行状态分别维护。</p>
        </div>
        {project?.published && (
          <a
            className="button button-outline"
            href={'/projects/' + project.slug}
            target="_blank"
            rel="noopener noreferrer"
          >
            预览已发布页面 ↗
          </a>
        )}
      </header>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      {(pDirty || eDirty) && <p className="dirty-note">有未保存的修改</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <fieldset disabled={busy}>
          <section className="studio-panel form-panel">
            <h2>基本资料</h2>
            <div className="form-columns">
              {input('项目名称', 'title')}
              {input('URL 标识（slug）', 'slug')}
              <label className="field">
                <span>项目类型</span>
                <select
                  value={draft.category}
                  onChange={(e) => field('category', e.target.value as ProjectCategory)}
                >
                  {[
                    ['website', '网站应用'],
                    ['game', '小游戏'],
                    ['tool', '开发工具'],
                    ['other', '其他'],
                  ].map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {input('项目分组', 'group')}
              <label className="field span-two">
                <span>项目简介</span>
                <textarea
                  rows={3}
                  value={draft.summary}
                  onChange={(e) => field('summary', e.target.value)}
                />
              </label>
              <MediaField
                label="项目封面"
                value={draft.coverUrl}
                onChange={(v) => field('coverUrl', v)}
              />
              <MediaField
                label="项目图标"
                value={draft.iconUrl}
                onChange={(v) => field('iconUrl', v)}
              />
              {input('在线地址', 'externalUrl')}
              {input('仓库地址', 'repositoryUrl')}
              <label className="field">
                <span>标签（用逗号分隔）</span>
                <input
                  value={draft.tags.join('，')}
                  onChange={(e) => field('tags', e.target.value.split(/[,，]/))}
                />
              </label>
              {input('显示顺序', 'sortOrder', 'number')}
            </div>
          </section>
          <section className="studio-panel form-panel">
            <h2>项目介绍与截图</h2>
            <div className="form-stack">
              <label className="field">
                <span>项目介绍（Markdown）</span>
                <textarea
                  rows={10}
                  value={draft.body}
                  onChange={(e) => field('body', e.target.value)}
                />
              </label>
              <label className="field">
                <span>项目截图（每行一个图片地址）</span>
                <textarea
                  rows={4}
                  value={draft.screenshots.join('\n')}
                  onChange={(e) => field('screenshots', e.target.value.split('\n'))}
                />
              </label>
              <p className="form-hint">
                从媒体库复制站内图片路径；只发布真实项目截图，不把设计素材当作线上截图。
              </p>
            </div>
          </section>
          <section className="studio-panel form-panel">
            <h2>运营状态与版本</h2>
            <div className="form-columns">
              <label className="field">
                <span>手动运营状态</span>
                <select
                  value={draft.status}
                  onChange={(e) => field('status', e.target.value as ProjectStatus)}
                >
                  {Object.entries(STATUS_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {input('当前版本', 'version')}
              {input('版本发布日期', 'versionDate', 'date')}
              {input('版本概要', 'versionSummary')}
              <label className="field span-two">
                <span>维护说明</span>
                <textarea
                  rows={3}
                  value={draft.maintenanceMessage}
                  onChange={(e) => field('maintenanceMessage', e.target.value)}
                />
              </label>
              <label className="check-choice">
                <input
                  type="checkbox"
                  checked={draft.allowEntryDuringMaintenance}
                  onChange={(e) => field('allowEntryDuringMaintenance', e.target.checked)}
                />
                维护时保留在线体验按钮
              </label>
            </div>
          </section>
          <section className="studio-panel form-panel">
            <h2>搜索优化</h2>
            <div className="form-columns">
              {input('独立 SEO 标题', 'seoTitle')}
              {input('SEO 描述', 'seoDescription')}
            </div>
            <div className="search-preview">
              <strong>{draft.seoTitle || draft.title || '项目名称'}</strong>
              <small>/projects/{draft.slug || '项目标识'}</small>
              <p>{draft.seoDescription || draft.summary || '项目摘要'}</p>
            </div>
          </section>
          <div className="editor-savebar">
            <label className="check-choice">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => field('published', e.target.checked)}
              />
              公开发布
            </label>
            <label className="check-choice">
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(e) => field('featured', e.target.checked)}
              />
              首页精选
            </label>
            <button className="button button-primary" type="submit">
              {busy ? '保存中…' : '保存项目'}
            </button>
            {project && (
              <button type="button" className="destructive" onClick={() => void remove()}>
                删除项目
              </button>
            )}
          </div>
        </fieldset>
      </form>
      {project ? (
        <section className="studio-panel form-panel">
          <h2>更新日志与开发计划</h2>
          <p className="form-hint">日志、计划、预告、规则与维护公告分别发布；草稿只在后台显示。</p>
          <div className="admin-entry-list">
            {entries.map((e) => (
              <div className="admin-entry" key={e.id}>
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    {ENTRY_LABELS[e.type]} · {e.published ? '已发布' : '草稿'}
                    {e.version ? ' · ' + e.version : ''}
                  </small>
                </div>
                <div>
                  <button className="text-action" disabled={busy} onClick={() => choose(e)}>
                    编辑
                  </button>
                  <button
                    className="destructive"
                    disabled={busy}
                    onClick={() => void deleteEntry(e.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void saveEntry()
            }}
          >
            <fieldset disabled={busy}>
              <div className="form-columns">
                <label className="field">
                  <span>内容类型</span>
                  <select
                    value={entry.type}
                    onChange={(e) => setEntry((v) => ({ ...v, type: e.target.value as EntryType }))}
                  >
                    {Object.entries(ENTRY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>记录标题</span>
                  <input
                    value={entry.title}
                    onChange={(e) => setEntry((v) => ({ ...v, title: e.target.value }))}
                  />
                </label>
                <label className="field span-two">
                  <span>记录正文（Markdown）</span>
                  <textarea
                    rows={6}
                    value={entry.body}
                    onChange={(e) => setEntry((v) => ({ ...v, body: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>关联版本</span>
                  <input
                    value={entry.version}
                    onChange={(e) => setEntry((v) => ({ ...v, version: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>计划进度</span>
                  <select
                    value={entry.roadmapStatus}
                    onChange={(e) =>
                      setEntry((v) => ({
                        ...v,
                        roadmapStatus: e.target.value as EntryDraft['roadmapStatus'],
                      }))
                    }
                  >
                    {[
                      ['idea', '想法'],
                      ['planned', '计划中'],
                      ['in-progress', '开发中'],
                      ['done', '已完成'],
                      ['paused', '搁置'],
                    ].map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {(['effectiveFrom', 'effectiveUntil', 'expectedAt'] as const).map((k, i) => (
                  <label className="field" key={k}>
                    <span>{['生效日期', '结束日期', '预计日期（可留空）'][i]}</span>
                    <input
                      type="date"
                      value={entry[k]}
                      onChange={(e) => setEntry((v) => ({ ...v, [k]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <div className="form-actions">
                <label className="check-choice">
                  <input
                    type="checkbox"
                    checked={entry.published}
                    onChange={(e) => setEntry((v) => ({ ...v, published: e.target.checked }))}
                  />
                  发布记录
                </label>
                <button className="button button-primary" type="submit">
                  {entryId ? '保存记录' : '新增记录'}
                </button>
                <button type="button" className="button button-outline" onClick={() => choose()}>
                  取消编辑
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      ) : (
        <p className="pending-note">先保存项目，再添加更新日志与开发计划。</p>
      )}
    </div>
  )
}
