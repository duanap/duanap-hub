import Database from 'better-sqlite3'
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, readdir, stat, lstat, rm } from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { getDatabase } from './db'
import { dataDirectory } from './storage'
type FileInfo = { path: string; size: number; sha256: string }
type Manifest = { format: 1; id: string; createdAt: string; schemaVersion: 1; files: FileInfo[] }
export type BackupInfo = {
  id: string
  createdAt: string
  size: number
  directory: string
  files: number
}
const maxSize = 128 * 1024 * 1024
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function safeFile(value: string) {
  return value === 'hub.sqlite' || /^media\/[a-f0-9-]{36}\.webp$/.test(value)
}
function root() {
  return path.join(dataDirectory(), 'backups')
}
function backupPath(id: string) {
  if (!/^[a-z0-9-]{10,80}$/.test(id)) throw new Error('备份标识无效')
  return path.join(root(), id)
}
async function loadDirectory(
  dir: string,
): Promise<{ manifest: Manifest; files: Map<string, Uint8Array> }> {
  const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as Manifest
  if (
    manifest.format !== 1 ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > 10000
  )
    throw new Error('备份格式或版本无效')
  const files = new Map<string, Uint8Array>()
  let total = 0
  for (const f of manifest.files) {
    if (!f || !safeFile(f.path) || files.has(f.path) || !Number.isSafeInteger(f.size) || f.size < 0)
      throw new Error('备份文件清单无效')
    const filename = path.join(dir, f.path),
      info = await lstat(filename)
    if (!info.isFile() || info.isSymbolicLink() || info.size !== f.size)
      throw new Error('备份文件大小或类型异常')
    total += info.size
    if (total > maxSize) throw new Error('备份超过安全大小上限')
    const data = await readFile(filename)
    if (digest(data) !== f.sha256) throw new Error('备份校验失败')
    files.set(f.path, new Uint8Array(data))
  }
  validateDatabase(files, dir)
  return { manifest, files }
}
function validateDatabase(files: Map<string, Uint8Array>, dir: string) {
  if (!files.has('hub.sqlite')) throw new Error('备份缺少数据库')
  const db = new Database(path.join(dir, 'hub.sqlite'), { readonly: true })
  try {
    if (
      db.pragma('integrity_check', { simple: true }) !== 'ok' ||
      db.pragma('user_version', { simple: true }) !== 1
    )
      throw new Error('数据库完整性或版本验证失败')
    for (const r of db.prepare('SELECT filename FROM media').all() as { filename: string }[])
      if (!files.has('media/' + r.filename)) throw new Error('备份缺少引用媒体')
  } finally {
    db.close()
  }
}
export async function createBackup(): Promise<BackupInfo> {
  const db = getDatabase(),
    id = new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomBytes(4).toString('hex'),
    directory = backupPath(id)
  const base = path.resolve(root()),
    pending = path.resolve(base, '.pending-' + id)
  if (!pending.startsWith(base + path.sep) || path.basename(pending) !== '.pending-' + id)
    throw new Error('临时备份路径无效')
  if (
    Number(db.pragma('page_count', { simple: true })) *
      Number(db.pragma('page_size', { simple: true })) >
    maxSize
  )
    throw new Error('备份超过 128 MiB，请通过离线运维备份')
  await mkdir(base, { recursive: true, mode: 0o700 })
  await mkdir(pending, { recursive: false, mode: 0o700 })
  let committed = false
  try {
    await db.backup(path.join(pending, 'hub.sqlite'))
    const databaseBytes = await stat(path.join(pending, 'hub.sqlite'))
    let total = databaseBytes.size
    if (total > maxSize) throw new Error('备份超过 128 MiB，请通过离线运维备份')
    const snapshot = new Database(path.join(pending, 'hub.sqlite'), { readonly: true }),
      names = ['hub.sqlite']
    try {
      for (const row of snapshot.prepare('SELECT filename FROM media').all() as {
        filename: string
      }[]) {
        const relative = 'media/' + row.filename
        if (!safeFile(relative)) throw new Error('媒体路径无效')
        const source = path.join(dataDirectory(), relative),
          info = await lstat(source)
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('媒体文件异常')
        total += info.size
        if (total > maxSize) throw new Error('备份超过 128 MiB，请通过离线运维备份')
        const bytes = await readFile(source)
        if (bytes.length !== info.size) throw new Error('媒体文件在备份期间变化，请重试')
        await mkdir(path.join(pending, 'media'), { recursive: true })
        await writeFile(path.join(pending, relative), bytes, { mode: 0o600, flag: 'wx' })
        names.push(relative)
      }
    } finally {
      snapshot.close()
    }
    const files: FileInfo[] = []
    for (const name of names) {
      const bytes = await readFile(path.join(pending, name))
      files.push({ path: name, size: bytes.length, sha256: digest(bytes) })
    }
    const manifest: Manifest = {
      format: 1,
      id,
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      files,
    }
    await writeFile(path.join(pending, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      mode: 0o600,
      flag: 'wx',
    })
    await loadDirectory(pending)
    await rename(pending, directory)
    committed = true
    return { id, createdAt: manifest.createdAt, size: total, directory, files: files.length }
  } finally {
    // This exclusive, generated directory belongs only to this invocation; valid snapshots are never removed.
    if (!committed) await rm(pending, { recursive: true, force: true })
  }
}
export async function listBackups(): Promise<Omit<BackupInfo, 'directory'>[]> {
  if (!existsSync(root())) return []
  const results: Omit<BackupInfo, 'directory'>[] = []
  for (const entry of await readdir(root(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{17}-[a-f0-9]{8}$/.test(entry.name)) continue
    try {
      const m = JSON.parse(
        await readFile(path.join(root(), entry.name, 'manifest.json'), 'utf8'),
      ) as Manifest
      if (
        m.format !== 1 ||
        m.schemaVersion !== 1 ||
        m.id !== entry.name ||
        typeof m.createdAt !== 'string' ||
        !Number.isFinite(Date.parse(m.createdAt)) ||
        !Array.isArray(m.files) ||
        m.files.length > 10000 ||
        m.files.some(
          (f) =>
            !f ||
            !safeFile(f.path) ||
            !Number.isSafeInteger(f.size) ||
            f.size < 0 ||
            typeof f.sha256 !== 'string' ||
            !/^[a-f0-9]{64}$/.test(f.sha256),
        )
      )
        throw new Error('Invalid backup manifest')
      results.push({
        id: entry.name,
        createdAt: m.createdAt,
        size: m.files.reduce((n, f) => n + f.size, 0),
        files: m.files.length,
      })
    } catch {
      console.warn('[backup] skipped unreadable or invalid manifest', entry.name)
    }
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function exportBackup(id: string) {
  const { manifest, files } = await loadDirectory(backupPath(id))
  return {
    manifest,
    files: Array.from(files, ([p, data]) => ({
      path: p,
      data: Buffer.from(data).toString('base64'),
    })),
  }
}
export async function restoreBackup(
  source: string,
  target: string,
): Promise<{ projects: number; media: number }> {
  const absolute = path.resolve(target)
  if (existsSync(absolute)) throw new Error('恢复目标已存在，拒绝覆盖')
  let data: { manifest: Manifest; files: Map<string, Uint8Array> }
  if ((await stat(source)).isDirectory()) data = await loadDirectory(path.resolve(source))
  else {
    if ((await stat(source)).size > maxSize * 1.5) throw new Error('备份文件过大')
    const bundle = JSON.parse(await readFile(source, 'utf8')) as {
      manifest: Manifest
      files: { path: string; data: string }[]
    }
    if (
      !bundle.manifest ||
      bundle.manifest.format !== 1 ||
      bundle.manifest.schemaVersion !== 1 ||
      !Array.isArray(bundle.files) ||
      !Array.isArray(bundle.manifest.files) ||
      bundle.files.length !== bundle.manifest.files.length
    )
      throw new Error('备份文件格式无效')
    const files = new Map<string, Uint8Array>()
    let total = 0
    for (const f of bundle.files) {
      if (
        !safeFile(f.path) ||
        files.has(f.path) ||
        typeof f.data !== 'string' ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(f.data)
      )
        throw new Error('备份内容无效')
      const bytes = new Uint8Array(Buffer.from(f.data, 'base64')),
        expected = bundle.manifest.files.find((x) => x.path === f.path)
      total += bytes.length
      if (
        total > maxSize ||
        !expected ||
        expected.size !== bytes.length ||
        expected.sha256 !== digest(bytes)
      )
        throw new Error('备份校验失败')
      files.set(f.path, bytes)
    }
    if (!files.has('hub.sqlite')) throw new Error('备份缺少数据库')
    data = { manifest: bundle.manifest, files }
  }
  await mkdir(absolute, { recursive: false, mode: 0o700 })
  for (const [name, bytes] of data.files) {
    const dest = path.join(absolute, name)
    await mkdir(path.dirname(dest), { recursive: true, mode: 0o700 })
    await writeFile(dest, bytes, { flag: 'wx', mode: 0o600 })
  }
  validateDatabase(data.files, absolute)
  const restored = new Database(path.join(absolute, 'hub.sqlite'))
  try {
    restored.exec('DELETE FROM admin_sessions;DELETE FROM admin_login_attempts;')
    return {
      projects: (restored.prepare('SELECT COUNT(*) n FROM projects').get() as { n: number }).n,
      media: (restored.prepare('SELECT COUNT(*) n FROM media').get() as { n: number }).n,
    }
  } finally {
    restored.close()
  }
}
