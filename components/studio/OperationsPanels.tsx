'use client'
import { useState } from 'react'
import { businessDay, formatBeijingTime } from '@/lib/dates'
import type { MediaItem } from '@/lib/media'
import type { BackupInfo } from '@/lib/backups'
import { studioApi } from './client'
export function MediaPanel({ initial }: { initial: MediaItem[] }) {
  const [media, setMedia] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false)
  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch('/api/studio/media', { method: 'POST', body: form }),
        data = await r.json()
      if (!r.ok) throw new Error(data.error || '上传失败')
      setMedia(data.media)
      setMessage('图片已安全上传')
      setError(false)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '上传失败')
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setMessage('媒体路径已复制')
      setError(false)
    } catch {
      setMessage('复制失败，请手动选择路径')
      setError(true)
    }
  }
  return (
    <>
      <div className="editor-heading">
        <div>
          <h1>媒体素材</h1>
          <p className="muted">图片保存在持久化目录，供封面、截图和头像使用。</p>
        </div>
        <label className="button button-primary">
          {busy ? '上传中…' : '上传图片'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            hidden
            disabled={busy}
            onChange={(e) => {
              void upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="form-hint">
        最多 5 MiB；验证图片内容后转为 WebP，GIF 保存首帧。已有媒体不自动删除。
      </p>
      {message && (
        <p role={error ? 'alert' : 'status'} className={error ? 'error-banner' : 'success-banner'}>
          {message}
        </p>
      )}
      {media.length ? (
        <div className="media-grid">
          {media.map((m) => (
            <article key={m.id} className="studio-panel media-card">
              <img src={m.url} alt={m.originalName} />
              <strong>{m.originalName}</strong>
              <small>
                {(m.size / 1024).toFixed(1)} KiB · {businessDay(m.createdAt)}
              </small>
              <code>{m.url}</code>
              <button className="button button-outline" onClick={() => void copy(m.url)}>
                复制图片路径
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>还没有上传的媒体。</h2>
          <p>原型插画用于装饰，项目截图请上传真实素材。</p>
        </div>
      )}
    </>
  )
}
export function BackupsPanel({ initial }: { initial: Omit<BackupInfo, 'directory'>[] }) {
  const [backups, setBackups] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false)
  async function create() {
    setBusy(true)
    setMessage('')
    try {
      const r = await studioApi<{ backups: typeof backups }>('/api/studio/backups', 'POST')
      setBackups(r.backups)
      setMessage('一致性快照和媒体校验完成，备份已创建')
      setError(false)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '备份失败')
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="editor-heading">
        <div>
          <h1>备份与恢复</h1>
          <p className="muted">SQLite 安全快照、持久化媒体和 SHA-256 校验清单。</p>
        </div>
        <button className="button button-primary" disabled={busy} onClick={() => void create()}>
          {busy ? '备份中…' : '创建安全备份'}
        </button>
      </div>
      {message && (
        <p role={error ? 'alert' : 'status'} className={error ? 'error-banner' : 'success-banner'}>
          {message}
        </p>
      )}
      <section className="studio-panel form-panel">
        <h2>备份历史</h2>
        <p className="form-hint">
          仅列可读取的有效清单；下载前会完整校验内容。异常清单请查看服务器日志。
        </p>
        <div className="table-scroll">
          <table className="backup-table">
            <thead>
              <tr>
                <th>创建时间</th>
                <th>文件数</th>
                <th>大小</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id}>
                  <td>{formatBeijingTime(b.createdAt)} 北京时间</td>
                  <td>{b.files}</td>
                  <td>{(b.size / 1024).toFixed(1)} KiB</td>
                  <td>
                    <a className="link-arrow" href={'/api/studio/backups/' + b.id}>
                      下载备份包
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!backups.length && <p className="quiet-empty">暂无可用的备份清单。</p>}
      </section>
      <section className="studio-panel form-panel">
        <h2>安全恢复流程</h2>
        <p className="muted">
          下载包可用于恢复演练。恢复只写全新目录，不在线覆盖正在运行的数据库；管理员会话不会被恢复。
        </p>
        <pre className="command-preview">
          pnpm restore:drill --backup &lt;备份目录或 JSON&gt; --target &lt;全新目录&gt;
        </pre>
        <p className="form-hint">
          核对恢复后的内容和媒体，再停服备份当前数据、切换持久化目录并启动。替换生产数据库需要单独确认，详见
          docs/DEPLOYMENT.md。
        </p>
      </section>
    </>
  )
}
