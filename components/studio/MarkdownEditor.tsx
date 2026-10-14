'use client'

import { useId, useState } from 'react'
import dynamic from 'next/dynamic'
import { Markdown } from '@/components/Markdown'

const RichMarkdownEditor = dynamic(() => import('./RichMarkdownEditor'), {
  ssr: false,
  loading: () => <p aria-live="polite">编辑器加载中…</p>,
})

export function MarkdownEditor({ label, name, value, onChange, disabled = false }: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const id = useId()
  const [preview, setPreview] = useState(false)
  const [source, setSource] = useState(false)
  const [notice, setNotice] = useState('')

  return <div className="field span-two markdown-editor" role="group" aria-label={`${name}编辑器`}>
    <div className="markdown-editor-heading">
      <label id={`${id}-label`} htmlFor={id}>{label}</label>
      <div className="markdown-mode-actions">
        <button type="button" className="text-action" disabled={disabled} aria-pressed={!preview && !source} onClick={() => { setSource(false); setPreview(false); setNotice('') }}>可视化编辑</button>
        <button type="button" className="text-action" disabled={disabled} aria-pressed={!preview && source} onClick={() => { setSource(true); setPreview(false) }}>Markdown 源码</button>
        <button type="button" className="text-action" disabled={disabled} aria-pressed={preview} onClick={() => setPreview(!preview)}>
          {preview ? `编辑${name}` : `预览${name}`}
        </button>
      </div>
    </div>
    <p className="markdown-editor-help">输入 ## 加空格变成标题，**文字**变成加粗；也可使用格式按钮。复杂语法可切换源码。</p>
    {notice && <p className="markdown-editor-notice" role="status">{notice}</p>}
    {preview
      ? <section className="markdown markdown-preview" aria-label={`${name}预览`}>
          {value.trim() ? <Markdown>{value}</Markdown> : <p>填写正文后即可预览。</p>}
        </section>
      : source
        ? <textarea id={id} rows={8} disabled={disabled} value={value} onChange={event => onChange(event.target.value)} />
        : <RichMarkdownEditor id={id} value={value} disabled={disabled} onChange={onChange}
            onUnsupported={() => { setSource(true); setNotice('这段正文包含可视化模式未覆盖的语法，已保留源码，可继续编辑或预览。') }} />}
  </div>
}
