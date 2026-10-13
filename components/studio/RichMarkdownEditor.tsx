'use client'

import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, Node as TiptapNode, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { hasSameMarkdownContent } from '@/lib/markdown'

// Unsupported pasted Markdown is inserted at the current selection unchanged,
// then handed to source mode. The default text paste would escape its syntax.
const RawMarkdown = TiptapNode.create({
  name: 'rawMarkdown',
  group: 'block',
  atom: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [],
  renderHTML: ({ node }) => ['pre', {}, node.attrs.source],
  renderMarkdown: node => node.attrs?.source || '',
})
const RawMarkdownInline = RawMarkdown.extend({
  name: 'rawMarkdownInline',
  group: 'inline',
  inline: true,
  renderHTML: ({ node }) => ['span', {}, node.attrs.source],
})

export default function RichMarkdownEditor({ id, value, disabled, onChange, onUnsupported }: {
  id: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onUnsupported: () => void
}) {
  const callbacks = useRef({ onChange, onUnsupported })
  callbacks.current = { onChange, onUnsupported }
  const synchronized = useRef<string | null>(null)
  const activeEditor = useRef<Editor | null>(null)
  const [ready, setReady] = useState(false)
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({ underline: false, trailingNode: false, link: { openOnClick: false } }),
      Markdown,
      Image.configure({ allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      RawMarkdown,
      RawMarkdownInline,
    ],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: { id, role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': `${id}-label` },
      handlePaste(_view, event) {
        const current = activeEditor.current
        const text = event.clipboardData?.getData('text/plain')
        if (!current?.isEditable || !text || current.isActive('codeBlock')) return false
        const looksLikeMarkdown = /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|~~~|\|)|(?:\*\*|__|!\[|\[[^\]]+\]\(|\[\^)/m.test(text)
        if (event.clipboardData?.getData('text/html') && !looksLikeMarkdown) return false
        const document = current.markdown!.parse(text)
        if (!hasSameMarkdownContent(text, current.markdown!.serialize(document))) {
          current.commands.insertContent({ type: text.includes('\n') ? 'rawMarkdown' : 'rawMarkdownInline', attrs: { source: text } })
          callbacks.current.onUnsupported()
          return true
        }
        return current.commands.insertContent(text, { contentType: 'markdown' })
      },
    },
    onUpdate({ editor: current }) {
      const markdown = current.getMarkdown()
      synchronized.current = markdown
      callbacks.current.onChange(markdown)
    },
  })
  activeEditor.current = editor

  useEffect(() => {
    if (!editor || value === synchronized.current) return
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    if (!hasSameMarkdownContent(value, editor.getMarkdown())) {
      editor.setEditable(false, false)
      callbacks.current.onUnsupported()
      return
    }
    synchronized.current = value
    setReady(true)
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(ready && !disabled, false)
  }, [editor, ready, disabled])

  const blocked = disabled || !ready || !editor
  return <div className="rich-markdown-editor">
    <div className="markdown-format-toolbar" role="toolbar" aria-label="正文格式">
      <button type="button" disabled={blocked} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>标题</button>
      <button type="button" disabled={blocked} onClick={() => editor?.chain().focus().toggleBold().run()}><strong>加粗</strong></button>
      <button type="button" disabled={blocked} onClick={() => editor?.chain().focus().toggleItalic().run()}><em>斜体</em></button>
      <button type="button" disabled={blocked} onClick={() => editor?.chain().focus().toggleBulletList().run()}>列表</button>
      <button type="button" disabled={blocked} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>引用</button>
      <button type="button" disabled={blocked} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>代码块</button>
      <button type="button" disabled={blocked} onClick={() => editor?.chain().focus().undo().run()}>撤销</button>
      <button type="button" disabled={blocked} onClick={() => editor?.chain().focus().redo().run()}>重做</button>
    </div>
    <EditorContent editor={editor} className="markdown rich-markdown-content" />
    {!editor && <p aria-live="polite">编辑器加载中…</p>}
  </div>
}
