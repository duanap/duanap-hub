import { SITE_ORIGIN } from '@/lib/config'
import { isEnabled } from '@/lib/db'

// The separate entry flag never enables account/points APIs. With accounts
// enabled, preserve the Hub PKCE transaction through the blog's QQ flow;
// otherwise delegate to the existing native blog login only.
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
  if (process.env.HUB_LOCAL_ACCOUNTS_ENABLED === '1') return '/api/member/qq'
  if (process.env.HUB_ACCOUNTS_ENABLED === '1' && isEnabled('accounts')) return '/api/auth/login?provider=qq'
  const base = qqBlogUrl()
  return base ? new URL('oauth/qq', base).href : null
}
export function qqCallbackDestination(): URL | null {
  // A configured blog URL does not prove both sites use the same QQ app.
  if (process.env.HUB_QQ_CALLBACK_RELAY_ENABLED !== '1') return null
  const base = qqBlogUrl()
  return base ? new URL('oauth/qq/callback', base) : null
}
