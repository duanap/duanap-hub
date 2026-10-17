import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: process.env.HUB_BUILD_WORKERS==='1'?{cpus:1}:undefined,
  // Markdown's default browser entity decoder uses document. Use its pure
  // implementation so the same parser also runs inside a DOM-free Worker.
  turbopack:{resolveAlias:{'decode-named-character-reference':'./node_modules/decode-named-character-reference/index.js'}},
  webpack(config){config.resolve.alias['decode-named-character-reference']=path.join(process.cwd(),'node_modules/decode-named-character-reference/index.js');return config},
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" }] },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/duanap/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/account/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/login/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/oauth/qq/callback', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Referrer-Policy', value: 'no-referrer' }] },
    ]
  },
}

export default nextConfig
