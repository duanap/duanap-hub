'use client'

import { useState } from 'react'
import { DEFAULT_HOME_WIDGETS, HOME_WIDGETS } from '@/lib/home-config'
import type { HubSettings, PublicIconId } from '@/lib/types'
import { MediaPicker } from './MediaPicker'

const iconFields: [PublicIconId, string][] = [['logo', '站点标志'], ['blog', '博客图标'], ['photos', '相册图标'], ['notes', '文案图标'], ['links', '友链图标'], ['about', '关于图标'], ['code', 'GitHub 图标'], ['mail', '邮箱图标'], ['music', '音乐图标'], ['rss', 'RSS 图标']]
export type SettingsField = <K extends keyof HubSettings>(key: K, value: HubSettings[K]) => void

export function HomeEditor({ settings, field, onMediaBusyChange }: { settings: HubSettings; field: SettingsField; onMediaBusyChange: (busy: boolean) => void }) {
  const [tags, setTags] = useState(settings.homeTags.join('\n'))
  const [image, setImage] = useState('')
  function move(index: number, direction: number) {
    const values = [...settings.homeWidgets], next = index + direction
    if (next < 0 || next >= values.length) return
    ;[values[index], values[next]] = [values[next], values[index]]
    field('homeWidgets', values)
  }
  function moveImage(index: number, direction: number) {
    const values = [...settings.homePhotoUrls], next = index + direction
    if (next < 0 || next >= values.length) return
    ;[values[index], values[next]] = [values[next], values[index]]
    field('homePhotoUrls', values)
  }
  return <>
    <section className="home-section"><div className="card-heading"><div><h3>首页卡片</h3><p>默认还原原站卡片位置。可调整显示、顺序和宽度；文字与内容单独编辑。</p></div><button type="button" className="action-secondary" onClick={() => field('homeWidgets', DEFAULT_HOME_WIDGETS.map(value => ({ ...value })))}>恢复默认卡片</button></div><div className="home-widget-list">{settings.homeWidgets.map((widget, index) => {
      const label = HOME_WIDGETS.find(value => value.id === widget.id)!.label
      return <div className="home-widget-row" key={widget.id}><label className="check-choice"><input type="checkbox" checked={widget.enabled} onChange={event => field('homeWidgets', settings.homeWidgets.map(value => value.id === widget.id ? { ...value, enabled: event.target.checked } : value))} />{label}</label><select aria-label={label + '宽度'} value={widget.width} onChange={event => field('homeWidgets', settings.homeWidgets.map(value => value.id === widget.id ? { ...value, width: event.target.value as typeof widget.width } : value))}><option value="auto">默认宽度</option><option value="small">窄</option><option value="wide">宽</option><option value="full">整行</option></select><button type="button" className="mini-arrow" disabled={index === 0} onClick={() => move(index, -1)} aria-label={'上移卡片 ' + label}>↑</button><button type="button" className="mini-arrow" disabled={index === settings.homeWidgets.length - 1} onClick={() => move(index, 1)} aria-label={'下移卡片 ' + label}>↓</button></div>
    })}</div></section>
    <section className="home-section"><h3>首页展示内容</h3><div className="form-columns">
      {([['介绍开场白', 'homeGreeting'], ['小花园文字', 'homeGardenText'], ['一句话署名', 'homeQuoteAuthor'], ['在读卡片标题', 'homeReadingLabel'], ['在读卡片内容', 'homeReadingText'], ['在读卡片链接', 'homeReadingUrl']] as const).map(([label, key]) => <label className="field" key={key}><span>{label}</span><input value={settings[key]} onChange={event => field(key, event.target.value)} /></label>)}
      <label className="field"><span>一句话卡片</span><textarea maxLength={300} value={settings.homeQuote} onChange={event => field('homeQuote', event.target.value)} /></label><label className="field"><span>终端文字</span><textarea rows={4} maxLength={1000} value={settings.homeConsole} onChange={event => field('homeConsole', event.target.value)} /></label>
      <label className="field"><span>兴趣标签（一行一个）</span><textarea rows={6} value={tags} onChange={event => { setTags(event.target.value); field('homeTags', event.target.value.split('\n').map(tag => tag.trim()).filter(Boolean)) }} /><small>最多30个，由你自行填写。</small></label>
    </div></section>
    <section className="home-section"><h3>首页照片</h3><label className="field"><span>首页照片来源</span><select value={settings.homePhotosSource} onChange={event => field('homePhotosSource', event.target.value as HubSettings['homePhotosSource'])}><option value="albums">已发布相册中的照片</option><option value="custom">单独挑选首页照片</option></select></label>
      {settings.homePhotosSource === 'albums' ? <p className="form-hint">从相册管理中已发布的照片读取。新增、下架或删除相册后同步生效。</p> : <><div className="studio-album-images">{settings.homePhotoUrls.map((url, index) => <div className="studio-album-row" key={url}><img src={url} alt={'首页照片 ' + (index + 1)} /><span>照片 {index + 1}</span><div className="studio-album-actions"><button type="button" aria-label={'上移首页照片 ' + (index + 1)} disabled={!index} onClick={() => moveImage(index, -1)}>↑</button><button type="button" aria-label={'下移首页照片 ' + (index + 1)} disabled={index === settings.homePhotoUrls.length - 1} onClick={() => moveImage(index, 1)}>↓</button><button type="button" className="text-action destructive" onClick={() => field('homePhotoUrls', settings.homePhotoUrls.filter(value => value !== url))}>移除首页照片 {index + 1}</button></div></div>)}</div><MediaPicker label="新增首页照片" value={image} onChange={setImage} onBusyChange={onMediaBusyChange} /><button type="button" className="action-secondary" disabled={!image || settings.homePhotoUrls.includes(image) || settings.homePhotoUrls.length >= 24} onClick={() => { field('homePhotoUrls', [...settings.homePhotoUrls, image]); setImage('') }}>添加首页照片</button></>}
    </section>
    <section className="home-section"><h3>自定义图标</h3><p className="form-hint">上传自己的图标或从媒体库选择；留空使用内置图标。彩色图标按原色展示。</p><div className="form-columns">{iconFields.map(([key, label]) => <MediaPicker key={key} label={label} value={settings.publicIcons[key] || ''} onChange={value => field('publicIcons', { ...settings.publicIcons, [key]: value })} onBusyChange={onMediaBusyChange} />)}</div></section>
  </>
}
