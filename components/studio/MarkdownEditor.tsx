'use client'

import { useId, useState } from 'react'
import ReactMarkdown from 'react-markdown'

export function MarkdownEditor({ label, name, value, onChange }: {
  label: string
  name: string
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const [preview, setPreview] = useState(false)

  return <div className="field span-two markdown-editor">
    <div className="markdown-editor-heading">
      <label htmlFor={id}>{label}</label>
      <button type="button" className="text-action" aria-pressed={preview} onClick={() => setPreview(!preview)}>
        {preview ? `编辑${name}` : `预览${name}`}
      </button>
    </div>
    {preview
      ? <section className="markdown markdown-preview" aria-label={`${name}预览`}>
          {value.trim() ? <ReactMarkdown>{value}</ReactMarkdown> : <p>填写正文后即可预览。</p>}
        </section>
      : <textarea id={id} rows={8} value={value} onChange={event => onChange(event.target.value)} />}
  </div>
}
