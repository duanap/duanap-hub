import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getDatabase } from './db'
import { dataDirectory } from './storage'
export type MediaItem = {
  id: string
  filename: string
  originalName: string
  mime: string
  size: number
  createdAt: string
  url: string
}
export function listMedia(): MediaItem[] {
  return (getDatabase().prepare('SELECT * FROM media ORDER BY created_at DESC').all() as any[]).map(
    (r) => ({
      id: r.id,
      filename: r.filename,
      originalName: r.original_name,
      mime: r.mime,
      size: r.size,
      createdAt: r.created_at,
      url: '/media/' + r.filename,
    }),
  )
}
export async function saveMedia(file: File): Promise<MediaItem> {
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('图片最多 5 MiB，不能是空文件')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let normalized: Buffer
  try {
    const image = sharp(bytes, { limitInputPixels: 20_000_000 }),
      meta = await image.metadata()
    if (!meta.format || !['png', 'jpeg', 'webp', 'gif'].includes(meta.format))
      throw new Error('不支持的图片格式')
    normalized = await image.rotate().webp({ quality: 85 }).toBuffer()
  } catch {
    throw new Error('请上传真实的 JPEG、PNG、WebP 或 GIF 图片（GIF 保存首帧）')
  }
  if (normalized.length > 5 * 1024 * 1024) throw new Error('处理后的图片仍超过 5 MiB')
  const id = randomUUID(),
    filename = id + '.webp',
    directory = path.join(dataDirectory(), 'media'),
    now = new Date().toISOString()
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(path.join(directory, filename), normalized, { flag: 'wx', mode: 0o600 })
  const originalName = path
    .basename(file.name)
    .replace(/[\u0000-\u001f]/g, '')
    .slice(0, 180)
  getDatabase()
    .prepare(
      'INSERT INTO media(id,filename,original_name,mime,size,created_at) VALUES (?,?,?,?,?,?)',
    )
    .run(id, filename, originalName, 'image/webp', normalized.length, now)
  return {
    id,
    filename,
    originalName,
    mime: 'image/webp',
    size: normalized.length,
    createdAt: now,
    url: '/media/' + filename,
  }
}
