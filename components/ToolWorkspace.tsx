'use client'
import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { ToolId } from '@/lib/tools'
import {
  encodeBase64,
  decodeBase64,
  unixToISO,
  beijingToUnix,
  inspectIP,
  generatePassword,
} from '@/lib/tool-functions'
export function ToolWorkspace({ id }: { id: ToolId }) {
  const [input, setInput] = useState(''),
    [result, setResult] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false),
    [length, setLength] = useState(20),
    [chars, setChars] = useState(['lower', 'upper', 'digit', 'symbol']),
    [exclude, setExclude] = useState(true),
    [unit, setUnit] = useState<'seconds' | 'milliseconds'>('seconds'),
    [date, setDate] = useState(''),
    preview = useRef<HTMLDivElement>(null)
  function run(action: () => string) {
    try {
      setResult(action())
      setError(false)
      setMessage('已在本地处理')
    } catch (e) {
      setError(true)
      setMessage(e instanceof Error ? e.message : '处理失败')
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        id === 'markdown' ? preview.current?.textContent || '' : result,
      )
      setError(false)
      setMessage('已复制')
    } catch {
      setError(true)
      setMessage('复制失败，可以手动选择文本')
    }
  }
  function download(value: string, extension: string) {
    const url = URL.createObjectURL(new Blob([value], { type: 'text/plain;charset=utf-8' })),
      a = document.createElement('a')
    a.href = url
    a.download = 'duanap-tool.' + extension
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const textarea = (
    <label className="field">
      <span>输入内容</span>
      <textarea
        rows={12}
        maxLength={100000}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="粘贴需要处理的内容…"
      />
    </label>
  )
  return (
    <section className="studio-panel tool-workspace">
      <div className="workspace-title">
        <h2>{id === 'password' ? '自定义密码规则' : '本地工作区'}</h2>
        <p>输入不上传服务器，不保存操作历史。</p>
      </div>
      {id === 'password' ? (
        <>
          <div className="password-result">
            <output aria-live="polite">{result || '点击生成安全密码'}</output>
          </div>
          <label className="tool-setting">
            密码长度：{length}
            <input
              type="range"
              min={8}
              max={128}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            />
          </label>
          <div className="tool-checks">
            {[
              ['lower', '小写字母'],
              ['upper', '大写字母'],
              ['digit', '数字'],
              ['symbol', '特殊符号'],
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={chars.includes(key)}
                  onChange={(e) =>
                    setChars((old) =>
                      e.target.checked ? [...old, key] : old.filter((x) => x !== key),
                    )
                  }
                />
                {label}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={exclude}
                onChange={(e) => setExclude(e.target.checked)}
              />
              排除容易混淆的字符
            </label>
          </div>
          <button
            className="button button-primary"
            onClick={() => run(() => generatePassword(length, chars, exclude))}
          >
            生成密码
          </button>
        </>
      ) : id === 'timestamp' ? (
        <>
          <div className="tool-option-grid">
            <div className="field">
              <label className="field">
                <span>Unix 时间戳</span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="例如 0"
                />
              </label>
              <select
                aria-label="时间戳单位"
                value={unit}
                onChange={(e) => setUnit(e.target.value as typeof unit)}
              >
                <option value="seconds">秒</option>
                <option value="milliseconds">毫秒</option>
              </select>
              <button
                className="button button-primary"
                onClick={() =>
                  run(() => {
                    const iso = unixToISO(input, unit)
                    return (
                      'UTC：' +
                      iso +
                      '\n北京时间：' +
                      new Intl.DateTimeFormat('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                      }).format(new Date(iso))
                    )
                  })
                }
              >
                时间戳转日期
              </button>
            </div>
            <div className="field">
              <label className="field">
                <span>北京时间（UTC+08:00）</span>
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <button
                className="button button-outline"
                onClick={() =>
                  run(() => {
                    const seconds = beijingToUnix(date)
                    return 'Unix 秒：' + seconds + '\nUnix 毫秒：' + seconds * 1000
                  })
                }
              >
                日期转时间戳
              </button>
            </div>
          </div>
        </>
      ) : id === 'markdown' ? (
        <>
          <div className="markdown-workspace">
            <div>
              {textarea}
              <label className="button button-outline">
                导入 Markdown
                <input
                  type="file"
                  accept=".md,.txt"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 1024 * 1024) {
                      setError(true)
                      setMessage('文件最多 1 MiB')
                      return
                    }
                    const text = await f.text()
                    if (text.length > 100000) {
                      setError(true)
                      setMessage('文本超过 100,000 个字符')
                      return
                    }
                    setInput(text)
                  }}
                />
              </label>
            </div>
            <div>
              <h3>安全预览</h3>
              <div className="markdown markdown-preview" ref={preview}>
                <ReactMarkdown
                  components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}
                >
                  {input || '在左侧输入 Markdown。'}
                </ReactMarkdown>
              </div>
            </div>
          </div>
          <div className="tool-work-actions">
            <button
              className="button button-primary"
              onClick={() =>
                download(
                  '<!doctype html><meta charset="utf-8">' + (preview.current?.innerHTML || ''),
                  'html',
                )
              }
            >
              导出 HTML
            </button>
            <button
              className="button button-outline"
              onClick={() => download(preview.current?.textContent || '', 'txt')}
            >
              导出纯文本
            </button>
            <button className="button button-outline" onClick={() => download(input, 'md')}>
              导出 Markdown
            </button>
          </div>
          <p className="pending-note">
            忽略原始 HTML 和远程图片，预览不会加载外部资源。Word 转换待完善。
          </p>
        </>
      ) : (
        <>
          {textarea}
          <div className="tool-work-actions">
            {id === 'json' ? (
              <>
                <button
                  className="button button-primary"
                  onClick={() => run(() => JSON.stringify(JSON.parse(input), null, 2))}
                >
                  美化 JSON
                </button>
                <button
                  className="button button-outline"
                  onClick={() => run(() => JSON.stringify(JSON.parse(input)))}
                >
                  压缩 JSON
                </button>
              </>
            ) : id === 'base64' ? (
              <>
                <button
                  className="button button-primary"
                  onClick={() => run(() => encodeBase64(input))}
                >
                  编码 Base64
                </button>
                <button
                  className="button button-outline"
                  onClick={() => run(() => decodeBase64(input))}
                >
                  解码 Base64
                </button>
              </>
            ) : (
              <button
                className="button button-primary"
                onClick={() =>
                  run(() => {
                    const info = inspectIP(input)
                    return (
                      info.address +
                      '\nIPv' +
                      info.version +
                      ' · ' +
                      info.kind +
                      '\n仅本地格式检查，没有地理归属地数据。'
                    )
                  })
                }
              >
                检查 IP
              </button>
            )}
          </div>
        </>
      )}
      {id !== 'password' && id !== 'markdown' && (
        <label className="field result-field">
          <span>处理结果</span>
          <textarea rows={7} value={result} readOnly />
        </label>
      )}
      <div className="tool-work-actions">
        <button
          className="button button-outline"
          disabled={!result && id !== 'markdown'}
          onClick={() => void copy()}
        >
          复制结果
        </button>
        {id !== 'password' && id !== 'markdown' && (
          <button
            className="button button-outline"
            disabled={!result}
            onClick={() => download(result, id === 'json' ? 'json' : 'txt')}
          >
            下载结果
          </button>
        )}
        <button
          className="button button-outline"
          onClick={() => {
            setInput('')
            setResult('')
            setMessage('已清空')
            setError(false)
          }}
        >
          清空
        </button>
      </div>
      <p
        className={'tool-inline-status ' + (error ? 'result-error' : '')}
        role={error ? 'alert' : 'status'}
      >
        {message}
      </p>
    </section>
  )
}
