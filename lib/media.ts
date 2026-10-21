import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open, mkdir, readdir, lstat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { DATA_DIR, ensureDataDirectory, withDataLock } from '@/lib/storage'
import { getDatabase } from '@/lib/db'
import { audioExtension, mediaName, mediaMime, MAX_AUDIO_BYTES, MAX_IMAGE_BYTES } from '@/scripts/media-policy.mjs'

export { MAX_IMAGE_BYTES, MAX_AUDIO_BYTES }
const MIME = 'image/webp'
const folder = path.join(DATA_DIR, 'media')
export const validMediaName = (name: string) => mediaName(name)
export type MediaItem = { name: string; url: string; size: number; mime: string; createdAt: string }

async function ensureFolder() {
  ensureDataDirectory()
  await mkdir(folder, { recursive: true, mode: 0o700 })
  if ((await lstat(folder)).isSymbolicLink()) throw new Error('媒体目录不可为符号链接')
}
export async function listMedia(): Promise<MediaItem[]> {
  await ensureFolder()
  const files = await readdir(folder)
  const media: MediaItem[] = []
  for (const name of files.filter(validMediaName)) {
    try {
      const stat = await lstat(path.join(folder, name))
      if (stat.isFile() && !stat.isSymbolicLink()) media.push({ name, url: '/media/' + name, size: stat.size, mime: mediaMime(name), createdAt: stat.birthtime.toISOString() })
    } catch { /* A concurrent unused-file deletion may remove an item. */ }
  }
  return media.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
export async function uploadImage(file: File): Promise<MediaItem> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('仅支持 PNG、JPEG、WebP 或 GIF 图片')
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('图片大小须在 5 MiB 以内')
  const source = Buffer.from(await file.arrayBuffer())
  const metadata = await sharp(source, { limitInputPixels: 25_000_000 }).metadata()
  if (!metadata.format || !['png', 'jpeg', 'webp', 'gif'].includes(metadata.format)) throw new Error('图片格式无效')
  // Decode, strip metadata and normalize. GIF covers use their first frame.
  const buffer = await sharp(source, { limitInputPixels: 25_000_000 }).rotate().webp({ quality: 85 }).toBuffer()
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('处理后的图片仍超过 5 MiB')
  return withDataLock(async () => {
    await ensureFolder()
    const name = randomUUID() + '.webp'
    await writeFile(path.join(folder, name), buffer, { flag: 'wx', mode: 0o600 })
    return { name, url: '/media/' + name, size: buffer.length, mime: MIME, createdAt: new Date().toISOString() }
  })
}
export async function readMedia(name: string) {
  if (!validMediaName(name)) return null
  await ensureFolder()
  const location = path.join(folder, name)
  try {
    const stat = await lstat(location)
    if (!stat.isFile() || stat.isSymbolicLink()) return null
    const handle = await open(location, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    try { return await handle.readFile() } finally { await handle.close() }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
export async function uploadAudio(file: File): Promise<MediaItem> {
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error('音频不能超过20 MiB')
  const source = Buffer.from(await file.arrayBuffer()), extension = audioExtension(source)
  return withDataLock(async () => {
    await ensureFolder()
    const name = randomUUID() + '.' + extension
    await writeFile(path.join(folder, name), source, { flag: 'wx', mode: 0o600 })
    return { name, url: '/media/' + name, size: source.length, mime: mediaMime(name), createdAt: new Date().toISOString() }
  })
}
export async function openMedia(name: string) {
  if (!validMediaName(name)) return null
  await ensureFolder()
  try {
    const location = path.join(folder, name), entry = await lstat(location)
    if (!entry.isFile() || entry.isSymbolicLink()) return null
    const handle = await open(location, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    let stat
    try { stat = await handle.stat() } catch (cause) { await handle.close(); throw cause }
    if (!stat.isFile() || !stat.size) { await handle.close(); return null }
    return { handle, size: stat.size, mime: mediaMime(name) }
  } catch (cause) { if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null; throw cause }
}
export async function deleteMedia(name: string) {
  if (!validMediaName(name)) throw new Error('媒体标识无效')
  return withDataLock(async () => {
    const url = '/media/' + name
    const db = getDatabase()
    const content = [
      ...db.prepare('SELECT * FROM site_settings').all(),
      ...db.prepare('SELECT * FROM projects').all(),
      ...db.prepare('SELECT * FROM project_entries').all(),
      ...db.prepare('SELECT * FROM albums').all(),
      ...db.prepare('SELECT * FROM notes').all(),
      ...db.prepare('SELECT * FROM friend_links').all(),
    ]
    if (content.some(row => JSON.stringify(row).includes(url))) return false
    await ensureFolder()
    const stat = await lstat(path.join(folder, name))
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('媒体文件无效')
    await unlink(path.join(folder, name))
    return true
  })
}
