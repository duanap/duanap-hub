'use client'
import { useState, useCallback, useEffect } from 'react'
import type { ToolState } from '@/lib/tools'
import { Icon } from '@/components/Icon'
import { studioApi } from './client'
import { useUnsaved } from './useUnsaved'
function ToolEditor({
  initial,
  onDirty,
}: {
  initial: ToolState
  onDirty: (id: string, value: boolean) => void
}) {
  const [t, setT] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false),
    guard = useUnsaved(t, (v) => onDirty(t.id, v), { key: 'tool:' + t.id, restore: setT })
  async function save() {
    setBusy(true)
    setMessage('')
    try {
      const r = await studioApi<{ tools: ToolState[] }>('/api/studio/tools', 'PATCH', {
          id: t.id,
          title: t.title,
          summary: t.summary,
          enabled: t.enabled,
        }),
        saved = r.tools.find((x) => x.id === t.id)!
      setT(saved)
      guard.markSaved(saved)
      setMessage('已保存')
      setError(false)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败')
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="studio-panel form-panel"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h2>
        <Icon name={t.icon} />
        {initial.title}
      </h2>
      <fieldset disabled={busy}>
        <div className="form-stack">
          <label className="field">
            <span>工具标题</span>
            <input
              value={t.title}
              onChange={(e) => setT((v) => ({ ...v, title: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>工具说明</span>
            <textarea
              rows={3}
              value={t.summary}
              onChange={(e) => setT((v) => ({ ...v, summary: e.target.value }))}
            />
          </label>
        </div>
        <div className="form-actions">
          <label className="check-choice">
            <input
              type="checkbox"
              checked={t.enabled}
              onChange={(e) => setT((v) => ({ ...v, enabled: e.target.checked }))}
            />
            公开启用
          </label>
          <button type="submit" className="button button-primary">
            保存工具
          </button>
          {t.enabled && (
            <a
              className="link-arrow"
              href={'/tools/' + t.id}
              target="_blank"
              rel="noopener noreferrer"
            >
              预览 ↗
            </a>
          )}
        </div>
      </fieldset>
      {message && (
        <p role={error ? 'alert' : 'status'} className={error ? 'result-error' : 'form-hint'}>
          {message}
        </p>
      )}
      {guard.dirty && <p className="dirty-note">有未保存的修改</p>}
    </form>
  )
}
export function ToolsEditor({
  items,
  onDirty,
}: {
  items: ToolState[]
  onDirty: (v: boolean) => void
}) {
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({})
  const changed = useCallback(
    (id: string, value: boolean) =>
      setDirtyMap((old) => (old[id] === value ? old : { ...old, [id]: value })),
    [],
  )
  const dirty = Object.values(dirtyMap).some(Boolean)
  // Each card reports its own saved state, so saving one card preserves other drafts.
  const notify = useCallback(
    (id: string, value: boolean) => {
      changed(id, value)
    },
    [changed],
  )
  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])
  return (
    <>
      <h1>工具管理</h1>
      <p className="muted">关闭工具同步影响目录、独立路由及 Sitemap。</p>
      <div className="studio-grid-two">
        {items.map((t) => (
          <ToolEditor initial={t} key={t.id} onDirty={notify} />
        ))}
      </div>
      <section className="studio-panel form-panel">
        <h2>后续工具 · 待完善</h2>
        <p className="muted">Word 格式转换和外部 IP 归属地数据将在后续独立接入。</p>
      </section>
    </>
  )
}
