'use client'
import { useState } from 'react'
import type { HubSettings } from '@/lib/types'
import { studioApi } from './client'
import { useUnsaved } from './useUnsaved'
import { MediaField } from './MediaField'
export function SiteEditor({
  settings,
  mode,
  onDirty,
}: {
  settings: HubSettings
  mode: 'site' | 'seo' | 'appearance'
  onDirty: (v: boolean) => void
}) {
  const [draft, setDraft] = useState(settings),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    guard = useUnsaved(draft, onDirty, { key: 'site:' + mode, restore: setDraft })
  function field<K extends keyof HubSettings>(key: K, value: HubSettings[K]) {
    setDraft((old) => ({ ...old, [key]: value }))
  }
  const input = (label: string, key: keyof HubSettings) => (
    <label className="field">
      <span>{label}</span>
      <input value={String(draft[key])} onChange={(e) => field(key, e.target.value as never)} />
    </label>
  )
  const text = (label: string, key: keyof HubSettings) => (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={5}
        value={String(draft[key])}
        onChange={(e) => field(key, e.target.value as never)}
      />
    </label>
  )
  async function save() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await studioApi<{ settings: HubSettings }>('/api/studio/site', 'PUT', draft)
      setDraft(r.settings)
      guard.markSaved(r.settings)
      setNotice('站点设置已保存')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <h1>{mode === 'seo' ? '搜索优化' : mode === 'appearance' ? '外观主题' : '站点与个人资料'}</h1>
      {guard.restored && <p className="form-hint">已恢复当前标签页的未保存草稿，请核对后保存。</p>}
      {guard.cacheError && <p className="error-banner">临时草稿缓存不可用，请保存后再离开。</p>}
      <p className="muted">内容保存在 SQLite，保存成功后影响新请求。</p>
      {guard.dirty && <p className="dirty-note">有未保存的修改</p>}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}
      <fieldset disabled={busy}>
        {mode === 'site' && (
          <>
            <section className="studio-panel form-panel">
              <h2>首页与个人介绍</h2>
              <div className="form-columns">
                {input('网站名称', 'siteName')}
                {input('公开昵称', 'displayName')}
                {input('首页标题', 'heroTitle')}
                {input('首页强调文字', 'heroAccent')}
                {text('简短介绍', 'tagline')}
                {text('关于我（Markdown）', 'biography')}
                {input('技能方向（逗号分隔）', 'skills')}
                {text('公开经历（Markdown，可留空）', 'experience')}
              </div>
            </section>
            <section className="studio-panel form-panel">
              <h2>社交与联系</h2>
              <div className="form-columns">
                {input('GitHub 地址', 'githubUrl')}
                {input('博客地址', 'blogUrl')}
                {input('公开邮箱', 'publicEmail')}
                {input('版权署名', 'copyright')}
                <MediaField
                  label="个人头像"
                  value={draft.avatarUrl}
                  onChange={(v) => field('avatarUrl', v)}
                />
              </div>
            </section>
            <div className="studio-grid-two">
              <section className="studio-panel form-panel">
                <h2>ICP备案</h2>
                <div className="form-stack">
                  {input('ICP备案号', 'icpNumber')}
                  {input('工信部备案链接', 'icpUrl')}
                </div>
              </section>
              <section className="studio-panel form-panel">
                <h2>公安备案</h2>
                <div className="form-stack">
                  {input('公安备案号', 'policeNumber')}
                  {input('公安备案链接', 'policeUrl')}
                </div>
              </section>
            </div>
          </>
        )}
        {mode === 'seo' && (
          <>
            <section className="studio-panel form-panel">
              <h2>基础 Meta</h2>
              <div className="form-stack">
                {input('首页 SEO 标题', 'seoTitle')}
                {text('首页 SEO 描述', 'seoDescription')}
                <label className="check-choice">
                  <input
                    type="checkbox"
                    checked={draft.seoIndexable}
                    onChange={(e) => field('seoIndexable', e.target.checked)}
                  />
                  允许公开内容收录
                </label>
              </div>
              <div className="search-preview">
                <strong>{draft.seoTitle}</strong>
                <small>站点主域名</small>
                <p>{draft.seoDescription}</p>
              </div>
            </section>
            <div className="studio-grid-two">
              <section className="studio-panel form-panel">
                <h2>Sitemap 与 robots</h2>
                <p className="muted">仅输出已发布、已启用的真实页面。</p>
                <div className="form-actions">
                  <a
                    className="button button-outline"
                    href="/sitemap.xml"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看 Sitemap
                  </a>
                  <a
                    className="button button-outline"
                    href="/robots.txt"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看 robots
                  </a>
                </div>
              </section>
              <section className="studio-panel form-panel">
                <h2>RSS 订阅</h2>
                <p className="muted">项目更新与公告，草稿不进入订阅。</p>
                <a
                  className="button button-outline"
                  href="/feed.xml"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  查看 Feed
                </a>
              </section>
            </div>
            <section className="studio-panel form-panel">
              <h2>搜索平台接入 · 待完善</h2>
              <p className="muted">站长平台统计与提交 API 在 P3 按真实权限接入；提交不等于收录。</p>
            </section>
          </>
        )}
        {mode === 'appearance' && (
          <section className="studio-panel form-panel">
            <h2>Little Space V4.4</h2>
            <p className="muted">暖白背景、品牌蓝、统一轻量卡片；尊重减少动态效果设置。</p>
            <div className="theme-palette">
              <span style={{ background: '#fafaf8' }} />
              <span style={{ background: '#3472f6' }} />
              <span style={{ background: '#1d2b45' }} />
              <span style={{ background: '#e8edf3' }} />
            </div>
            <label className="field">
              <span>网站默认主题</span>
              <select
                value={draft.defaultTheme}
                onChange={(e) =>
                  field('defaultTheme', e.target.value as HubSettings['defaultTheme'])
                }
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
                <option value="system">跟随设备</option>
              </select>
            </label>
            <p className="form-hint">访客主动选择的主题保留为设备偏好，优先于站点默认值。</p>
          </section>
        )}
        <div className="editor-savebar">
          <button type="submit" className="button button-primary">
            {busy ? '保存中…' : '保存设置'}
          </button>
        </div>
      </fieldset>
    </form>
  )
}
