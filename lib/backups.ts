import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { mkdir, readdir, lstat, readFile, writeFile, unlink } from 'node:fs/promises'
import Database from 'better-sqlite3'
import { getDatabase } from '@/lib/db'
import { DATA_DIR, withDataLock, ensureDataDirectory } from '@/lib/storage'
import { encodeBackup, mediaName } from '@/scripts/backup-format.mjs'

const directory = path.join(DATA_DIR, 'backups')
export const validBackupName = (name: string) => /^backup-[a-f0-9-]{36}\.hub\.gz$/.test(name)
export type BackupItem = { name: string; size: number; createdAt: string }
async function folder() {
  ensureDataDirectory(); await mkdir(directory, { recursive: true, mode: 0o700 })
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('备份目录不可为符号链接')
}
export async function listBackups(): Promise<BackupItem[]> {
  await folder()
  const entries: BackupItem[] = []
  for (const name of (await readdir(directory)).filter(validBackupName)) {
    const stat = await lstat(path.join(directory, name))
    if (stat.isFile() && !stat.isSymbolicLink()) entries.push({ name, size: stat.size, createdAt: stat.birthtime.toISOString() })
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function createBackup(): Promise<BackupItem> {
  return withDataLock(async () => {
    await folder()
    const snapshot = path.join(directory, '.snapshot-' + randomUUID() + '.sqlite')
    try {
      await getDatabase().backup(snapshot)
      const copy = new Database(snapshot)
      try { copy.pragma('journal_mode = DELETE'); copy.pragma('secure_delete = ON'); copy.exec('DELETE FROM admin_sessions; DELETE FROM admin_login_attempts; VACUUM;') }
      finally { copy.close() }
      const media: { name: string; data: Buffer }[] = []
      let total = (await lstat(snapshot)).size
      if (total > 80 * 1024 * 1024) throw new Error('备份内容过大')
      const mediaFolder = path.join(DATA_DIR, 'media')
      try {
        if ((await lstat(mediaFolder)).isSymbolicLink()) throw new Error('媒体目录不可为符号链接')
        const names = (await readdir(mediaFolder)).filter(mediaName)
        if (names.length > 1000) throw new Error('媒体数量超过备份上限')
        for (const name of names) {
          const location = path.join(mediaFolder, name), stat = await lstat(location)
          if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('媒体文件无效')
          total += stat.size
          if (stat.size > 5 * 1024 * 1024 || total > 80 * 1024 * 1024) throw new Error('备份内容过大')
          media.push({ name, data: await readFile(location) })
        }
      } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause }
      const archive = encodeBackup(await readFile(snapshot), media)
      const name = 'backup-' + randomUUID() + '.hub.gz'
      await writeFile(path.join(directory, name), archive, { flag: 'wx', mode: 0o600 })
      return { name, size: archive.length, createdAt: new Date().toISOString() }
    } finally { await unlink(snapshot).catch(() => undefined) }
  })
}
export async function downloadBackup(name: string) {
  if (!validBackupName(name)) return null
  await folder()
  try {
    const location = path.join(directory, name), stat = await lstat(location)
    if (!stat.isFile() || stat.isSymbolicLink()) return null
    return await readFile(location)
  } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null; throw cause }
}
