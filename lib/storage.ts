import { mkdirSync, readFileSync, writeFileSync, unlinkSync, lstatSync, existsSync } from 'node:fs'
import path from 'node:path'

export const DATA_DIR = process.env.HUB_DATA_DIR
  ? path.resolve(/* turbopackIgnore: true */ process.env.HUB_DATA_DIR)
  : path.join(process.cwd(), 'data')

const state = globalThis as typeof globalThis & { hubDataQueue?: Promise<unknown> }
export function withDataLock<T>(work: () => Promise<T>): Promise<T> {
  const task = (state.hubDataQueue || Promise.resolve()).then(work)
  state.hubDataQueue = task.catch(() => undefined)
  return task
}
export function ensureDataDirectory() {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
  if (lstatSync(DATA_DIR).isSymbolicLink()) throw new Error('持久化目录不可为符号链接')
}

const leases = new Set<string>()
export function acquireRuntimeLease() {
  ensureDataDirectory()
  const maintenance = path.join(DATA_DIR, '.hub-maintenance.lock')
  if (existsSync(maintenance)) throw new Error('数据正在离线恢复，请在恢复结束后启动应用')
  const lease = path.join(DATA_DIR, '.hub-runtime.lock')
  if (leases.has(lease)) return
  if (existsSync(lease)) {
    if (lstatSync(lease).isSymbolicLink()) throw new Error('运行锁不可为符号链接')
    const previous = readFileSync(lease, 'utf8')
    const { pid } = JSON.parse(previous) as { pid: number }
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('运行锁无效，请先检查持久化目录')
    if (pid !== process.pid) {
      let active = true
      try { process.kill(pid, 0) } catch (error) { active = (error as NodeJS.ErrnoException).code !== 'ESRCH' }
      if (active) throw new Error('该数据目录已被另一应用进程使用')
      if (readFileSync(lease, 'utf8') !== previous) throw new Error('运行锁已变化，请重试')
      unlinkSync(lease)
    } else { leases.add(lease); return }
  }
  const content = JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })
  writeFileSync(lease, content, { flag: 'wx', mode: 0o600 })
  if (existsSync(maintenance)) { unlinkSync(lease); throw new Error('恢复进程已取得数据目录，请稍后重试') }
  leases.add(lease)
  process.once('exit', () => {
    try { if (readFileSync(lease, 'utf8') === content) unlinkSync(lease) } catch { /* stale locks are checked on the next start */ }
  })
}
