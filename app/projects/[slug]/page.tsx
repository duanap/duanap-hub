import Link from 'next/link'
import { businessDay } from '@/lib/dates'
import { notFound, permanentRedirect } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { PublicShell } from '@/components/PublicShell'
import { ProjectTabs } from '@/components/ProjectTabs'
import { Gallery } from '@/components/Gallery'
import { Icon } from '@/components/Icon'
import { getProjectBySlug, getRedirectSlug, getProjectEntries, isEnabled } from '@/lib/db'
import { pageMetadata, safeJsonLd } from '@/lib/seo'
import { STATUS_LABELS, ENTRY_LABELS } from '@/lib/types'
import { SITE_BASE } from '@/lib/config'
type Props = { params: Promise<{ slug: string }> }
const planLabels = {
  idea: '想法',
  planned: '计划中',
  'in-progress': '开发中',
  done: '已完成',
  paused: '搁置',
}
export async function generateMetadata({ params }: Props) {
  const { slug } = await params,
    p = getProjectBySlug(slug)
  if (!p || !isEnabled('projects'))
    return pageMetadata('项目不存在', '项目尚未发布。', '/projects/' + slug, false)
  return {
    ...pageMetadata(
      p.seoTitle || p.title,
      p.seoDescription || p.summary || p.title,
      '/projects/' + slug,
    ),
    openGraph: {
      ...pageMetadata(p.title, p.summary, '/projects/' + slug).openGraph,
      images: p.coverUrl ? [p.coverUrl] : [],
    },
  }
}
export default async function ProjectDetail({ params }: Props) {
  if (!isEnabled('projects')) notFound()
  const { slug } = await params,
    p = getProjectBySlug(slug)
  if (!p) {
    const redirect = getRedirectSlug(slug)
    if (redirect) permanentRedirect('/projects/' + redirect)
    notFound()
  }
  const entries = getProjectEntries(p.id, true),
    logs = entries.filter((e) => e.type === 'changelog'),
    plans = entries.filter((e) => e.type === 'roadmap' || e.type === 'preview'),
    rules = entries.filter((e) => e.type === 'rules'),
    notices = entries.filter((e) => e.type === 'notice')
  const url = new URL('/projects/' + p.slug, SITE_BASE).href,
    json = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CreativeWork',
          name: p.title,
          description: p.summary,
          url,
          image: p.coverUrl || undefined,
          dateModified: p.contentUpdatedAt,
          version: p.version || undefined,
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: '首页', item: SITE_BASE },
            {
              '@type': 'ListItem',
              position: 2,
              name: '作品',
              item: new URL('/projects', SITE_BASE).href,
            },
            { '@type': 'ListItem', position: 3, name: p.title, item: url },
          ],
        },
      ],
    }
  return (
    <PublicShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(json) }} />
      <div className="container project-detail-page">
        <Link className="back-link" href="/projects">
          ← 返回作品中心
        </Link>
        <div className="project-banner">
          {p.coverUrl ? (
            <img src={p.coverUrl} alt={p.title + ' 封面'} />
          ) : (
            <div className="detail-cover-fallback">
              <Icon name="folder" />
            </div>
          )}
        </div>
        <header className="detail-header">
          <div className="detail-title">
            <div>
              {p.iconUrl && <img className="project-logo" src={p.iconUrl} alt="" />}
              <h1>{p.title}</h1>
              <p>{p.summary}</p>
            </div>
            <span
              className={'status status-' + (p.status === 'maintenance' ? 'warning' : p.status)}
            >
              <i />
              {STATUS_LABELS[p.status]}
            </span>
          </div>
          <div className="detail-meta">
            {p.version && <span>当前版本 {p.version}</span>}
            {p.versionDate && <time>{p.versionDate}</time>}
            {p.group && <span>{p.group}</span>}
          </div>
          <div className="hero-actions">
            {p.externalUrl &&
              (p.status === 'online' ||
                (p.status === 'maintenance' && p.allowEntryDuringMaintenance)) && (
                <a
                  href={p.externalUrl}
                  className="button button-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  在线体验 <Icon name="arrow" />
                </a>
              )}
            {p.repositoryUrl && (
              <a
                href={p.repositoryUrl}
                className="button button-outline"
                target="_blank"
                rel="noopener noreferrer"
              >
                源码仓库 <Icon name="github" />
              </a>
            )}
          </div>
        </header>
        {(p.status === 'maintenance' || notices.length > 0) && (
          <aside className="maintenance-banner">
            <Icon name="settings" />
            <div>
              <strong>{p.status === 'maintenance' ? '维护公告' : '项目公告'}</strong>
              {p.status === 'maintenance' && (
                <p>{p.maintenanceMessage || '项目正在维护，具体安排请以管理员公告为准。'}</p>
              )}
              {notices.map((e) => (
                <div id={'update-' + e.id} key={e.id}>
                  <strong>{e.title}</strong>
                  <ReactMarkdown>{e.body}</ReactMarkdown>
                </div>
              ))}
            </div>
          </aside>
        )}
        <ProjectTabs
          panels={[
            <div key="intro">
              <h2>项目介绍</h2>
              <div className="markdown">
                {p.body ? (
                  <ReactMarkdown>{p.body}</ReactMarkdown>
                ) : (
                  <p className="muted">项目介绍正在整理。</p>
                )}
                {rules.map((e) => (
                  <section key={e.id} id={'update-' + e.id}>
                    <h3>{e.title}</h3>
                    <ReactMarkdown>{e.body}</ReactMarkdown>
                  </section>
                ))}
              </div>
              <div className="work-tags">
                {p.tags.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
            </div>,
            <div key="shots">
              <h2>项目截图</h2>
              {p.screenshots.length ? (
                <Gallery images={p.screenshots} title={p.title} />
              ) : (
                <p className="quiet-empty">管理员尚未上传项目截图。</p>
              )}
            </div>,
            <div key="logs">
              <h2>更新日志</h2>
              {p.versionSummary && (
                <p className="version-summary">
                  {p.version} · {p.versionSummary}
                </p>
              )}
              {logs.length ? (
                logs.map((e) => (
                  <article className="content-entry" key={e.id} id={'update-' + e.id}>
                    <div className="entry-meta">
                      <span>{e.version || ENTRY_LABELS[e.type]}</span>
                      <time>{e.publishedAt ? businessDay(e.publishedAt) : ''}</time>
                    </div>
                    <h3>{e.title}</h3>
                    <div className="markdown">
                      <ReactMarkdown>{e.body}</ReactMarkdown>
                    </div>
                  </article>
                ))
              ) : (
                <p className="quiet-empty">暂时没有已发布的更新日志。</p>
              )}
            </div>,
            <div key="plans">
              <h2>开发计划</h2>
              <p className="muted">记录下一步想做的事，计划不是发布日期承诺。</p>
              {plans.length ? (
                plans.map((e) => (
                  <article className="content-entry" key={e.id} id={'update-' + e.id}>
                    <div className="entry-meta">
                      <span>{planLabels[e.roadmapStatus]}</span>
                      {e.expectedAt && <time>预计 {e.expectedAt}</time>}
                    </div>
                    <h3>{e.title}</h3>
                    <div className="markdown">
                      <ReactMarkdown>{e.body}</ReactMarkdown>
                    </div>
                  </article>
                ))
              ) : (
                <p className="quiet-empty">暂时没有已发布的开发计划。</p>
              )}
            </div>,
          ]}
        />
      </div>
    </PublicShell>
  )
}
