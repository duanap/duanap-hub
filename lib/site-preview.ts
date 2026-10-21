import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import ipaddr from 'ipaddr.js'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'

type Address = { address: string; family: number }
type HtmlResult = { status: number; location?: string; html?: string }
type PreviewIO = { resolve: (hostname: string) => Promise<Address[]>; requestHtml: (url: URL, address: Address, signal: AbortSignal) => Promise<HtmlResult> }
const MAX_HTML = 256 * 1024

export function websiteUrl(input: string) {
  if (typeof input !== 'string' || !input.trim() || input.length > 500 || /[\\\x00-\x20]/.test(input.trim())) throw Error('请填写有效的网站地址')
  const value = input.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:/i.test(value)) throw Error('仅支持 HTTP(S) 网站')
  let url: URL
  try { url = new URL(value.startsWith('//') ? 'https:' + value : /^https?:/i.test(value) ? value : 'https://' + value) } catch { throw Error('请填写有效的网站地址') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80'))) throw Error('仅支持不带账号的 HTTP(S) 标准端口网站')
  url.hash = ''
  return url
}
export function isPublicAddress(address: string) {
  try { return ipaddr.process(address).range() === 'unicast' } catch { return false }
}
async function deadline<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let aborted: (() => void) | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { aborted = () => reject(Error('获取网站信息超时')); signal.addEventListener('abort', aborted, { once: true }) })])
  } finally { if (aborted) signal.removeEventListener('abort', aborted) }
}
async function publicTarget(url: URL, signal: AbortSignal, resolve: PreviewIO['resolve']) {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || /\.(localhost|local|internal|home)$/.test(host)) throw Error('仅允许获取公开网站的信息')
  const addresses = ipaddr.isValid(host) ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }] : await deadline(resolve(host), signal)
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw Error('仅允许获取公开网站的信息')
  return addresses.find(item => item.family === 4) || addresses[0]
}
export function requestWebsiteHtml(url: URL, address: Address, signal: AbortSignal): Promise<HtmlResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (error: Error) => { if (!settled) { settled = true; reject(error) } }
    const finish = (value: HtmlResult) => { if (!settled) { settled = true; resolve(value) } }
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(url, {
      method: 'GET', agent: false, signal, family: address.family,
      // Use the checked DNS result for the socket; preserve original Host/SNI and TLS verification.
      lookup: (_host, _options, callback) => callback(null, address.address, address.family),
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity', 'User-Agent': 'duanap-link-preview/1.0' },
    }, response => {
      const status = response.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(status)) { finish({ status, location: response.headers.location }); response.destroy(); return }
      if (status !== 200 || !/^(text\/html|application\/xhtml\+xml)\b/i.test(response.headers['content-type'] || '') || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) { fail(Error('网站未返回可读取的页面')); response.destroy(); return }
      const chunks: Buffer[] = []; let bytes = 0
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > MAX_HTML) { fail(Error('网站信息超过读取上限，可手动填写')); response.destroy(); return }
        chunks.push(chunk)
        const html = Buffer.concat(chunks).toString('utf8'), end = html.toLowerCase().indexOf('</head>')
        if (end >= 0) { finish({ status, html: html.slice(0, end + 7) }); response.destroy() }
      })
      response.on('end', () => finish({ status, html: Buffer.concat(chunks).toString('utf8') }))
      response.on('error', fail)
      response.on('aborted', () => fail(Error('网站响应不完整')))
    })
    request.on('error', () => fail(Error(signal.aborted ? '获取网站信息超时' : '网站暂时无法连接，可手动填写')))
    request.end()
  })
}
type HtmlNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HtmlNode[] }
export function parseWebsiteMetadata(html: string, base: URL) {
  if (Buffer.byteLength(html) > MAX_HTML) throw Error('网站信息超过读取上限')
  const tree = unified().use(rehypeParse).parse(html) as HtmlNode
  const pending = [tree]; let title = '', site = '', app = '', icon = '', apple = '', visited = 0
  while (pending.length && visited++ < 30000) {
    const node = pending.pop()!, props = node.properties || {}
    if (node.tagName === 'title' && !title) title = (node.children || []).map(child => child.value || '').join('')
    if (node.tagName === 'meta') {
      const key = String(props.property || props.name || '').toLowerCase()
      if (key === 'og:site_name' && !site) site = String(props.content || '')
      if (key === 'application-name' && !app) app = String(props.content || '')
    }
    if (node.tagName === 'link' && props.href) {
      const rel = (Array.isArray(props.rel) ? props.rel.map(String) : String(props.rel || '').split(/\s+/)).map(value => value.toLowerCase())
      if (rel.includes('icon') && !icon) icon = String(props.href)
      if (rel.includes('apple-touch-icon') && !apple) apple = String(props.href)
    }
    if (node.children) pending.push(...[...node.children].reverse())
  }
  const name = (site || app || title || base.hostname).replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  let iconUrl = new URL('/favicon.ico', base).href
  try { const value = new URL(icon || apple || '/favicon.ico', base).href; if (value.length <= 500) iconUrl = websiteUrl(value).href } catch { /* Keep the same-site favicon fallback. */ }
  return { title: name, iconUrl }
}
const productionIO: PreviewIO = { resolve: hostname => lookup(hostname, { all: true, verbatim: true }), requestHtml: requestWebsiteHtml }
export async function inspectWebsite(input: string, io: PreviewIO = productionIO) {
  const original = websiteUrl(input), signal = AbortSignal.timeout(5000)
  let url = original
  for (let hop = 0; hop <= 3; hop++) {
    const address = await publicTarget(url, signal, io.resolve)
    const result = await deadline(io.requestHtml(url, address, signal), signal)
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (!result.location || hop === 3) throw Error('网站跳转过多，可手动填写')
      url = websiteUrl(new URL(result.location, url).href); continue
    }
    if (result.status !== 200 || result.html === undefined) throw Error('网站未返回可读取的页面')
    const metadata = parseWebsiteMetadata(result.html, url)
    try { await publicTarget(websiteUrl(metadata.iconUrl), signal, io.resolve) }
    catch { metadata.iconUrl = new URL('/favicon.ico', url).href }
    return { url: original.href, ...metadata }
  }
  throw Error('无法获取网站信息')
}
