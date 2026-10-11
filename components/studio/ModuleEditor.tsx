'use client'
import { useState } from 'react'
import type { ModuleState } from '@/lib/types'
import { studioApi } from './client'
export function ModuleEditor({ initial }: { initial: ModuleState[] }) {
  const [modules, setModules] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [preview, setPreview] = useState(false)
  async function patch(payload: unknown) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setModules(
        (await studioApi<{ modules: ModuleState[] }>('/api/studio/modules', 'PATCH', payload))
          .modules,
      )
      setNotice('模块配置已保存')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  function move(index: number, delta: number) {
    const next = [...modules],
      target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    void patch({ order: next.map((m) => m.id) })
  }
  return (
    <>
      <div className="editor-heading">
        <div>
          <h1>首页编排与模块</h1>
          <p className="muted">上移、下移即时保存。核心与扩展通过运行时配置隔离。</p>
        </div>
        <button className="button button-outline" onClick={() => setPreview((v) => !v)}>
          {preview ? '关闭预览' : '按需预览'}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-banner">
          {notice}
        </p>
      )}
      <section className="studio-panel form-panel">
        {modules.map((m, i) => (
          <div className="hub-module-row" key={m.id}>
            <div className="module-order">
              <button
                disabled={busy || i === 0}
                aria-label={'上移 ' + m.name}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                disabled={busy || i === modules.length - 1}
                aria-label={'下移 ' + m.name}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
            </div>
            <div className="module-text">
              <strong>{m.name}</strong>
              <small>
                {m.summary} · P{m.stage}
              </small>
            </div>
            <label className="check-choice">
              <input
                type="checkbox"
                checked={m.enabled}
                disabled={busy || !m.available}
                onChange={() => void patch({ id: m.id, enabled: !m.enabled })}
              />
              {m.available ? '启用' : '待完善'}
            </label>
          </div>
        ))}
        <p className="form-hint">
          游戏展示和最近动态依赖项目模块。关闭项目会同步停止它们的公开入口；数据保留。
        </p>
      </section>
      {preview && (
        <section className="studio-panel form-panel">
          <h2>首页预览</h2>
          <iframe
            title="当前已保存的首页预览"
            src={'/?preview=' + Date.now()}
            className="home-preview"
            loading="lazy"
          />
          <a href="/" className="link-arrow" target="_blank" rel="noopener noreferrer">
            打开独立预览 ↗
          </a>
        </section>
      )}
    </>
  )
}
