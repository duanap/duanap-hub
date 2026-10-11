import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import { PublicShell } from '@/components/PublicShell'
import { Hero } from '@/components/Hero'
import { getSiteSettings, isEnabled } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
export function generateMetadata() {
  const s = getSiteSettings()
  return pageMetadata('关于 ' + s.displayName, s.tagline, '/about', isEnabled('about'))
}
export default function AboutPage() {
  if (!isEnabled('about')) notFound()
  const s = getSiteSettings()
  return (
    <PublicShell>
      <Hero
        site={s}
        kind="about"
        title="你好，我是"
        accent={s.displayName + '。'}
        description={s.tagline}
      />
      <div className="container about-content">
        <section className="section-block">
          <div className="section-heading">
            <h2>关于我</h2>
          </div>
          {s.avatarUrl && (
            <img className="profile-avatar" src={s.avatarUrl} alt={s.displayName + ' 头像'} />
          )}
          <div className="markdown">
            <ReactMarkdown>{s.biography}</ReactMarkdown>
          </div>
        </section>
        <section className="section-block">
          <h2>喜欢的方向</h2>
          <div className="skill-tags">
            {s.skills
              .split(/[,，\n]/)
              .filter(Boolean)
              .map((x) => (
                <span key={x}>{x}</span>
              ))}
          </div>
        </section>
        {s.experience && (
          <section className="section-block">
            <h2>一路走来</h2>
            <div className="markdown">
              <ReactMarkdown>{s.experience}</ReactMarkdown>
            </div>
          </section>
        )}
      </div>
    </PublicShell>
  )
}
