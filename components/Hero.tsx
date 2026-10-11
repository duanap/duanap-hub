import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { HubSettings } from '@/lib/types'
import { Icon } from './Icon'
export function Hero({
  site,
  kind = 'home',
  title,
  accent,
  description,
  showProjects = true,
  showAbout = true,
}: {
  site: HubSettings
  kind?: 'home' | 'about' | 'games' | 'projects' | 'tools'
  title?: string
  accent?: string
  description?: string
  showProjects?: boolean
  showAbout?: boolean
}) {
  const asset =
    kind === 'about' ? 'hero-about-rabbit' : kind === 'games' ? 'hero-game-rabbit' : 'hero-rabbit'
  return (
    <section
      className={'hero-zone hero-' + kind}
      style={{ '--hero-image': 'url("/assets/' + asset + '.webp")' } as CSSProperties}
    >
      <div className="container hero-inner">
        <div className="hero-copy">
          <p className="eyebrow">
            {kind === 'home'
              ? '个人数字空间'
              : kind === 'about'
                ? '关于我'
                : kind === 'games'
                  ? '小游戏'
                  : kind === 'projects'
                    ? '我的作品'
                    : '工具中心'}
          </p>
          <h1>
            {title || site.heroTitle}
            <br />
            <em>{accent || site.heroAccent}</em>
          </h1>
          <p className="hero-desc">{description || site.tagline}</p>
          {kind === 'home' && (
            <div className="hero-actions">
              {showProjects && (
                <Link className="button button-dark" href="/projects">
                  探索我的作品 <Icon name="arrow" />
                </Link>
              )}
              {showAbout && (
                <Link className="button button-soft" href="/about">
                  了解更多关于我
                </Link>
              )}
            </div>
          )}
          {(kind === 'home' || kind === 'about') && (
            <div className="hero-social">
              {site.githubUrl && (
                <a href={site.githubUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="github" />
                  GitHub
                </a>
              )}
              {site.blogUrl && (
                <a href={site.blogUrl} target="_blank" rel="noopener noreferrer">
                  <Icon name="book" />
                  Blog
                </a>
              )}
              {site.publicEmail && (
                <a href={'mailto:' + site.publicEmail}>
                  <Icon name="mail" />
                  Email
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
