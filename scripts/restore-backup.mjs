import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import Database from 'better-sqlite3'
import { decodeBackup, encodeBackup, mediaName, MAX_ARCHIVE_BYTES } from './backup-format.mjs'

const options = new Map()
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index]
  if (key === '--confirm-restore') options.set(key, true)
  else if (['--input', '--data-dir'].includes(key)) options.set(key, process.argv[++index])
  else throw new Error('未知参数：' + key)
}
if (!options.get('--confirm-restore') || typeof options.get('--input') !== 'string' || typeof options.get('--data-dir') !== 'string') {
  console.error('用法：停止应用后 node scripts/restore-backup.mjs --input BACKUP --data-dir DATA_DIR --confirm-restore')
  process.exit(1)
}
const directory = path.resolve(options.get('--data-dir'))
const within = name => {
  const target = path.resolve(directory, name), relative = path.relative(directory, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('目标路径越界')
  return target
}
function regular(location) {
  if (existsSync(location) && lstatSync(location).isSymbolicLink()) throw new Error('恢复目标不允许符号链接')
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('运行锁无效')
  try { process.kill(pid, 0); return true } catch (cause) { return cause.code !== 'ESRCH' }
}
const maintenance = within('.hub-maintenance.lock')
const runtime = within('.hub-runtime.lock')
let owned = false
let safeToRelease = true
let staging = '', rollback = ''
const lease = JSON.stringify({ pid: process.pid })
try {
  regular(path.resolve(options.get('--input')))
  if (lstatSync(path.resolve(options.get('--input'))).size > MAX_ARCHIVE_BYTES) throw new Error('备份文件过大')
  const backup = decodeBackup(readFileSync(path.resolve(options.get('--input'))))
  regular(directory); mkdirSync(directory, { recursive: true, mode: 0o700 })
  regular(maintenance); regular(runtime)
  if (existsSync(maintenance)) {
    const previous = readFileSync(maintenance, 'utf8')
    if (alive(JSON.parse(previous).pid)) throw new Error('另一恢复进程正在运行')
    if (readFileSync(maintenance, 'utf8') !== previous) throw new Error('维护锁已变化')
    unlinkSync(maintenance)
  }
  writeFileSync(maintenance, lease, { flag: 'wx', mode: 0o600 }); owned = true
  if (existsSync(runtime)) {
    const previous = readFileSync(runtime, 'utf8')
    if (alive(JSON.parse(previous).pid)) throw new Error('应用仍在运行，请停止应用后恢复')
    if (readFileSync(runtime, 'utf8') !== previous) throw new Error('运行锁已变化')
    unlinkSync(runtime)
  }
  for (const name of ['hub.sqlite', 'hub.sqlite-wal', 'hub.sqlite-shm', 'media', 'backups']) regular(within(name))
  staging = within('.restore-' + randomUUID()); rollback = within('rollback-' + randomUUID())
  mkdirSync(staging, { mode: 0o700 }); mkdirSync(path.join(staging, 'media'))
  writeFileSync(path.join(staging, 'hub.sqlite'), backup.database, { mode: 0o600 })
  const restored = new Database(path.join(staging, 'hub.sqlite'))
  try { restored.pragma('secure_delete = ON'); restored.exec('DELETE FROM admin_sessions; DELETE FROM admin_login_attempts; VACUUM;') } finally { restored.close() }
  for (const file of backup.media) writeFileSync(path.join(staging, 'media', file.name), file.data, { flag: 'wx', mode: 0o600 })
  mkdirSync(rollback, { mode: 0o700 })
  const database = within('hub.sqlite')
  if (existsSync(database)) {
    const old = new Database(database)
    try {
      await old.backup(path.join(rollback, 'hub.sqlite'))
    } finally { old.close() }
    const rollbackDatabase = new Database(path.join(rollback, 'hub.sqlite'))
    try { rollbackDatabase.pragma('journal_mode = DELETE'); rollbackDatabase.pragma('secure_delete = ON'); rollbackDatabase.exec('DELETE FROM admin_sessions; DELETE FROM admin_login_attempts; VACUUM;') } finally { rollbackDatabase.close() }
    const mediaDirectory = within('media'), media = []
    if (existsSync(mediaDirectory)) for (const name of readdirSync(mediaDirectory).filter(mediaName)) {
      const location = path.join(mediaDirectory, name); regular(location)
      if (!lstatSync(location).isFile()) throw new Error('回滚媒体文件无效')
      media.push({ name, data: readFileSync(location) })
    }
    writeFileSync(path.join(rollback, 'rollback.hub.gz'), encodeBackup(readFileSync(path.join(rollback, 'hub.sqlite')), media), { flag: 'wx', mode: 0o600 })
  }
  const moved = [], installed = []
  try {
    safeToRelease = false
    for (const name of ['hub.sqlite', 'hub.sqlite-wal', 'hub.sqlite-shm', 'media']) {
      if (existsSync(within(name))) { renameSync(within(name), path.join(rollback, 'original-' + name)); moved.push(name) }
    }
    renameSync(path.join(staging, 'hub.sqlite'), database); installed.push('hub.sqlite')
    renameSync(path.join(staging, 'media'), within('media')); installed.push('media')
    safeToRelease = true
  } catch (cause) {
    // Only installed replacements may be removed; unmoved files still belong to the original data.
    for (const name of installed.reverse()) renameSync(within(name), path.join(staging, 'failed-' + name))
    for (const name of moved.reverse()) {
      renameSync(path.join(rollback, 'original-' + name), within(name))
    }
    safeToRelease = true
    throw cause
  }
  console.log('恢复成功。rollback: ' + rollback)
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : '恢复失败')
  if (!safeToRelease) console.error('自动回滚未完成，维护锁已保留。请检查 staging: ' + staging + ' ; rollback: ' + rollback)
  process.exitCode = 1
}
finally { if (owned && safeToRelease && readFileSync(maintenance, 'utf8') === lease) unlinkSync(maintenance) }
