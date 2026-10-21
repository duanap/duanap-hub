'use client'

import { useEffect, useRef, useState } from 'react'
import type { Album, AlbumImage, ContentKind, FriendLink, PersonalNote } from '@/lib/types'
import { MediaPicker } from './MediaPicker'
import { MarkdownEditor } from './MarkdownEditor'

type Item = Album | PersonalNote | FriendLink
const labels = { albums: '相册', notes: '随记', links: '友链' }
const blank = () => ({ title: '', summary: '', coverUrl: '', images: [] as AlbumImage[], body: '', imageUrl: '', publishedAt: '', url: '', groupName: '', iconUrl: '', published: false, sortOrder: 0 })
type Draft = ReturnType<typeof blank>
function editable(item?: Item): Draft {
  if (!item) return blank()
  return { ...blank(), title: item.title, published: item.published, sortOrder: item.sortOrder,
    ...('images' in item ? { summary: item.summary, coverUrl: item.coverUrl, images: item.images.map(image => ({ ...image })) } : {}),
    ...('body' in item ? { body: item.body, imageUrl: item.imageUrl, publishedAt: item.publishedAt } : {}),
    ...('url' in item ? { url: item.url, summary: item.summary, groupName: item.groupName, iconUrl: item.iconUrl } : {}),
  }
}
function localDate(value: string) {
  if (!value) return ''
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function ContentManager({ kind, busy: parentBusy, onDirtyChange, onBusyChange, onMediaBusyChange }: {
  kind: ContentKind; busy: boolean; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void; onMediaBusyChange: (value: boolean) => void
}) {
  const label = labels[kind]
  const [items, setItems] = useState<Item[]>([])
  const [draft, setDraft] = useState<Draft>(blank)
  const [saved, setSaved] = useState<Draft>(blank)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [newImage, setNewImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const dirty = open && (JSON.stringify(draft) !== JSON.stringify(saved) || !!newImage.trim())
  const locked = busy || parentBusy
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => { onDirtyChange(false); onBusyChange(false) }, [onDirtyChange, onBusyChange])
  useEffect(() => {
    const controller = new AbortController()
    onBusyChange(true); setBusy(true); setError('')
    void fetch('/api/studio/content/' + kind, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json()
      if (response.status === 401) { window.location.assign('/duanap/login'); return }
      if (!response.ok) throw new Error(data.error || '读取失败')
      setItems(data.items)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '读取失败') })
      .finally(() => { if (!controller.signal.aborted) { setBusy(false); onBusyChange(false) } })
    return () => controller.abort()
  }, [kind, onBusyChange])

  function field<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(previous => ({ ...previous, [key]: value })) }
  function mayLeave() { return !inFlight.current && !locked && (!dirty || window.confirm('有未保存的修改，离开会丢弃这些修改。继续吗？')) }
  function edit(item?: Item) {
    if (!mayLeave()) return
    const next = editable(item)
    setDraft(next); setSaved(next); setActiveId(item?.id ?? null); setOpen(true); setNewImage(''); setNotice(''); setError('')
  }
  function close() { if (mayLeave()) { setOpen(false); setNewImage(''); setDraft(blank()); setSaved(blank()) } }
  function payload() {
    const common = { title: draft.title, published: draft.published, sortOrder: draft.sortOrder }
    if (kind === 'albums') return { ...common, summary: draft.summary, coverUrl: draft.coverUrl, images: newImage.trim() ? [...draft.images, { url: newImage.trim(), caption: '' }] : draft.images }
    if (kind === 'notes') return { ...common, body: draft.body, imageUrl: draft.imageUrl, publishedAt: draft.publishedAt }
    return { ...common, url: draft.url, summary: draft.summary, groupName: draft.groupName, iconUrl: draft.iconUrl }
  }
  async function write(method: 'POST' | 'PATCH' | 'DELETE') {
    if (locked || inFlight.current) return
    if (method === 'DELETE' && (!activeId || !window.confirm('删除“' + draft.title + '”？删除后无法撤销，图片文件仍保留在媒体库。'))) return
    inFlight.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/studio/content/' + kind + (method === 'POST' ? '' : '/' + activeId), {
        method, headers: { 'Content-Type': 'application/json' }, body: method === 'DELETE' ? undefined : JSON.stringify(payload()),
      })
      const data = await response.json()
      if (response.status === 401) { window.location.assign('/duanap/login'); return }
      if (!response.ok) throw new Error(data.error || '保存失败')
      setItems(data.items); setNewImage('')
      if (method === 'DELETE') { setOpen(false); setDraft(blank()); setSaved(blank()); setActiveId(null); setNotice(label + '已删除') }
      else { const next = editable(data.item); setDraft(next); setSaved(next); setActiveId(data.item.id); setNotice(label + '已保存') }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
    finally { inFlight.current = false; setBusy(false); onBusyChange(false) }
  }
  function addImage() {
    if (!newImage.trim()) return
    if (draft.images.some(image => image.url === newImage.trim())) { setError('同一相册不能重复添加图片'); return }
    field('images', [...draft.images, { url: newImage.trim(), caption: '' }]); setNewImage(''); setError('')
  }
  function moveImage(index: number, direction: -1 | 1) {
    const images = [...draft.images], next = index + direction
    if (next < 0 || next >= images.length) return
    ;[images[index], images[next]] = [images[next], images[index]]
    field('images', images)
  }
  const visible = items.filter(item => item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (filter === 'all' || item.published === (filter === 'published')))
  return <div className="studio-content-manager">
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {!open ? <section className="studio-card"><div className="card-heading"><div><h2>{label}管理</h2><p>独立保存、排序和发布，草稿仅管理员可见。</p></div><button type="button" className="action-primary" disabled={locked} onClick={() => edit()}>+ 新增{label}</button></div>
      <div className="content-filters"><input aria-label={'搜索' + label} placeholder={'搜索' + label + '标题'} value={search} disabled={locked} onChange={event => setSearch(event.target.value)} /><select aria-label={label + '发布筛选'} value={filter} disabled={locked} onChange={event => setFilter(event.target.value)}><option value="all">全部状态</option><option value="published">已发布 / 已排期</option><option value="draft">草稿</option></select></div>
      <div className="studio-content-list">{visible.map(item => <button type="button" className="studio-content-card" key={item.id} aria-label={'编辑' + label + '：' + item.title} disabled={locked} onClick={() => edit(item)}>
        <strong>{item.title}</strong><small>{!item.published ? '草稿' : 'publishedAt' in item && item.publishedAt > new Date().toISOString() ? '已排期' : '已发布'} · 排序 {item.sortOrder}</small><span>{'images' in item ? `${item.images.length} 张图片` : 'url' in item ? item.groupName || item.url : item.body.replace(/[#*`]/g, '').slice(0, 90)}</span>
      </button>)}</div>{!visible.length && <div className="studio-empty">{busy ? '读取中…' : '没有符合条件的' + label + '。'}</div>}
    </section> : <section className="studio-card"><div className="card-heading"><div><h2>{activeId ? '编辑' : '新增'}{label}</h2><p>保存后公开页面会读取最新内容。</p></div><button type="button" className="action-secondary" disabled={locked} onClick={close}>返回{label}列表</button></div>
      <fieldset className="studio-fieldset" disabled={locked}><div className="form-columns">
        <label className="field"><span>{label}标题</span><input value={draft.title} maxLength={120} onChange={event => field('title', event.target.value)} /></label>
        <label className="field"><span>{label}排序</span><input type="number" min={-1000000} max={1000000} value={draft.sortOrder} onChange={event => field('sortOrder', Number(event.target.value))} /></label>
        <label className="check-choice"><input type="checkbox" checked={draft.published} onChange={event => field('published', event.target.checked)} />公开发布{label}</label>
        {kind !== 'notes' && <label className="field span-two"><span>{label}简介</span><textarea value={draft.summary} maxLength={500} rows={3} onChange={event => field('summary', event.target.value)} /></label>}
        {kind === 'albums' && <><MediaPicker label="相册封面" value={draft.coverUrl} onChange={value => field('coverUrl', value)} onBusyChange={onMediaBusyChange} /><div className="field"><span>相册图片</span><p className="form-hint">最多 48 张，可填写说明并调整先后顺序；封面也会作为图片展示。</p></div></>}
        {kind === 'notes' && <><label className="field"><span>随记发布时间</span><input type="datetime-local" value={localDate(draft.publishedAt)} onChange={event => { const value = event.target.value; if (!value) field('publishedAt', ''); else if (!Number.isNaN(new Date(value).getTime())) field('publishedAt', new Date(value).toISOString()) }} /><small>使用本机时区；留空立即发布，未来时间将定时公开。</small></label><MediaPicker label="随记配图" value={draft.imageUrl} onChange={value => field('imageUrl', value)} onBusyChange={onMediaBusyChange} /><MarkdownEditor key={'note-' + activeId} name="随记正文" label="随记正文（Markdown）" value={draft.body} onChange={value => field('body', value)} disabled={locked} /></>}
        {kind === 'links' && <><label className="field"><span>友链地址</span><input type="url" value={draft.url} placeholder="https://…" maxLength={500} onChange={event => field('url', event.target.value)} /></label><label className="field"><span>友链分组</span><input value={draft.groupName} maxLength={60} placeholder="朋友 / 设计 / 开发" onChange={event => field('groupName', event.target.value)} /></label><MediaPicker label="友链图标" value={draft.iconUrl} onChange={value => field('iconUrl', value)} onBusyChange={onMediaBusyChange} /></>}
      </div>
      {kind === 'albums' && <div className="studio-album-images">{draft.images.map((image, index) => <div className="studio-album-row" key={image.url}>
        <img src={image.url} alt={'相册图片 ' + (index + 1)} /><label className="field"><span>图片说明 {index + 1}</span><input value={image.caption} maxLength={300} onChange={event => field('images', draft.images.map((item, itemIndex) => itemIndex === index ? { ...item, caption: event.target.value } : item))} /></label>
        <div className="studio-album-actions"><button type="button" className="mini-arrow" aria-label={'上移图片 ' + (index + 1)} disabled={index === 0 || locked} onClick={() => moveImage(index, -1)}>↑</button><button type="button" className="mini-arrow" aria-label={'下移图片 ' + (index + 1)} disabled={index === draft.images.length - 1 || locked} onClick={() => moveImage(index, 1)}>↓</button><button type="button" className="text-action destructive" aria-label={'移除图片 ' + (index + 1)} onClick={() => field('images', draft.images.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>
      </div>)}<div className="studio-new-image"><MediaPicker label="新增相册图片" value={newImage} onChange={setNewImage} onBusyChange={onMediaBusyChange} /><button type="button" className="action-secondary" disabled={locked || !newImage.trim() || draft.images.length >= 48} onClick={addImage}>添加图片到相册</button></div></div>}
      <div className="studio-form-bottom"><span className="draft-indicator">{dirty ? '有未保存的修改' : ''}</span><div className="form-actions">{activeId && <button type="button" className="text-action destructive" onClick={() => void write('DELETE')}>删除{label}</button>}<button type="button" className="action-primary" onClick={() => void write(activeId ? 'PATCH' : 'POST')}>{busy ? '保存中…' : '保存' + label}</button></div></div>
      </fieldset>
    </section>}
  </div>
}
