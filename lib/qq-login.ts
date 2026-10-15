import { SITE_ORIGIN } from '@/lib/config'

// This entry delegates to the existing blog QQ flow. It neither creates a Hub
// session nor enables account/points APIs. Set the flag only after configuring
// and verifying a real QQ application on WordPress.
function qqBlogUrl(): URL | null {
  try {
    const base = new URL(process.env.HUB_WORDPRESS_URL || '')
    const local = process.env.HUB_ACCOUNTS_ALLOW_LOOPBACK === '1' && new URL(SITE_ORIGIN).hostname === '127.0.0.1' && base.hostname === '127.0.0.1'
    if ((base.protocol !== 'https:' && !(local && base.protocol === 'http:')) || base.username || base.password || base.search || base.hash) return null
    base.pathname = base.pathname.replace(/\/*$/, '/')
    return base
  } catch { return null }
}
export function qqLoginDestination(): string | null {
  if (process.env.HUB_QQ_LOGIN_ENABLED !== '1') return null
  const base = qqBlogUrl()
  return base ? new URL('oauth/qq', base).href : null
}
export function qqCallbackDestination(): URL | null {
  const base = qqBlogUrl()
  return base ? new URL('oauth/qq/callback', base) : null
}
