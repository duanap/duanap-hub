'use client'
import { useEffect, useState } from 'react'
import type { BackupItem } from '@/lib/backups'
export function BackupPanel() {
  const [backups, setBackups] = useState<BackupItem[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function load() {
    const response = await fetch('/api/studio/backups', { cache: 'no-store' }), data = await response.json()
    if (!response.ok) throw new Error(data.error || '读取失败')
    setBackups(data.backups)
  }
  useEffect(() => { void load().catch(cause => setError(cause.message)) }, [])
  async function create() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/studio/backups', { method: 'POST' }), data = await response.json()
      if (!response.ok) throw new Error(data.error || '备份失败')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '备份失败') }
    finally { setBusy(false) }
  }
  return <section className="studio-card span-two"><div className="card-heading"><div><h2>备份与恢复</h2><p>保存站点内容和媒体图片，不包含环境密钥或管理员登录会话。</p></div>
    <button type="button" className="action-primary" disabled={busy} onClick={() => void create()}>{busy ? '备份中…' : '创建备份'}</button></div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="backup-list">{backups.map(item => <div key={item.name}><span>{item.createdAt.replace('T', ' ').slice(0, 19)} UTC · {Math.ceil(item.size / 1024)} KiB</span><a className="action-secondary" href={'/api/studio/backups/' + item.name}>下载备份</a></div>)}</div>
    {!backups.length && <p>还没有备份。保存重要修改后创建一份，并下载到另一块磁盘。</p>}
    <details className="restore-guide"><summary>恢复备份</summary><p>恢复会替换主站内容。先停止应用，把备份保存在数据目录外，再在项目目录执行下面的命令；确认路径后输入确认参数。脚本会先保留回滚副本，恢复结束后再启动应用。</p>
      <pre>node scripts/restore-backup.mjs --input BACKUP.hub.gz --data-dir DATA_DIR --confirm-restore</pre>
      <p>脚本会拒绝活动进程、损坏的备份和越界文件路径。恢复期间保持维护状态；需要回滚时，使用脚本输出目录中保留的原始文件。</p>
    </details>
  </section>
}
