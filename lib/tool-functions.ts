function bounded(value: string) {
  if (value.length > 100000) throw new Error('输入最多 100,000 个字符')
}
export function encodeBase64(value: string) {
  bounded(value)
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
export function decodeBase64(value: string) {
  bounded(value)
  const v = value.trim()
  if (v.length % 4 !== 0 || !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    throw new Error('Base64 格式无效')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(v), (c) => c.charCodeAt(0)),
    )
  } catch {
    throw new Error('无法解码为 UTF-8 文本')
  }
}
export function unixToISO(value: string, unit: 'seconds' | 'milliseconds') {
  if (!/^-?\d{1,16}$/.test(value.trim())) throw new Error('请输入整数时间戳')
  const n = Number(value) * (unit === 'seconds' ? 1000 : 1),
    d = new Date(n)
  if (!Number.isFinite(d.getTime())) throw new Error('时间超出范围')
  return d.toISOString()
}
export function beijingToUnix(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error('请输入完整北京时间')
  const full = value.length === 16 ? value + ':00' : value,
    d = new Date(full + '+08:00')
  if (
    !Number.isFinite(d.getTime()) ||
    new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 19) !== full
  )
    throw new Error('日期无效')
  return Math.floor(d.getTime() / 1000)
}
function ipv4(v: string) {
  return (
    /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(v) &&
    v.split('.').every((n) => Number(n) <= 255)
  )
}
export function inspectIP(value: string): { address: string; version: 4 | 6; kind: string } {
  const v = value.trim()
  if (v.length > 100) throw new Error('IP 地址过长')
  if (ipv4(v)) {
    const [a, b, c] = v.split('.').map(Number)
    let kind = '公网地址格式（未查询归属地）'
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) kind = '私有地址'
    else if (a === 127) kind = '回环地址'
    else if (a === 169 && b === 254) kind = '链路本地地址'
    else if (a === 100 && b >= 64 && b <= 127) kind = '运营商共享地址'
    else if (a >= 224 && a <= 239) kind = '组播地址'
    else if (
      a === 0 ||
      a >= 240 ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    )
      kind = '保留或文档地址'
    return { address: v, version: 4, kind }
  }
  if (!v.includes(':') || /[^a-fA-F0-9:.]/.test(v) || (v.match(/::/g) || []).length > 1)
    throw new Error('IP 地址格式无效')
  let normalized = v.toLowerCase()
  if (normalized.includes('.')) {
    const pos = normalized.lastIndexOf(':'),
      last = normalized.slice(pos + 1)
    if (!ipv4(last)) throw new Error('IPv6 内嵌 IPv4 无效')
    const octets = last.split('.').map(Number)
    normalized =
      normalized.slice(0, pos + 1) +
      ((octets[0] << 8) | octets[1]).toString(16) +
      ':' +
      ((octets[2] << 8) | octets[3]).toString(16)
  }
  const parts = normalized.split('::'),
    groups = parts.flatMap((p) => (p ? p.split(':') : []))
  if (
    groups.some((x) => !/^[a-f0-9]{1,4}$/.test(x)) ||
    (parts.length === 1 && groups.length !== 8) ||
    (parts.length === 2 && groups.length >= 8)
  )
    throw new Error('IPv6 地址格式无效')
  const expanded =
    parts.length === 2
      ? [
          ...(parts[0] ? parts[0].split(':') : []),
          ...Array(8 - groups.length).fill('0'),
          ...(parts[1] ? parts[1].split(':') : []),
        ]
      : groups
  const nums = expanded.map((x) => parseInt(x, 16))
  let kind = 'IPv6 地址格式（未查询归属地）'
  if (nums.every((x) => x === 0)) kind = '未指定地址'
  else if (nums.slice(0, 7).every((x) => x === 0) && nums[7] === 1) kind = '回环地址'
  else if (nums.slice(0, 5).every((x) => x === 0) && nums[5] === 65535) kind = 'IPv4 映射地址'
  else if (nums.slice(0, 6).every((x) => x === 0)) kind = 'IPv4 兼容地址（已弃用）'
  else if ((nums[0] & 0xfe00) === 0xfc00) kind = '唯一本地地址'
  else if ((nums[0] & 0xffc0) === 0xfe80) kind = '链路本地地址'
  else if ((nums[0] & 0xff00) === 0xff00) kind = '组播地址'
  else if (nums[0] === 0x2001 && nums[1] === 0xdb8) kind = '文档地址'
  return { address: v, version: 6, kind }
}
const groups: Record<string, string> = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%^&*-_+=',
}
export function generatePassword(length: number, selected: string[], excludeAmbiguous: boolean) {
  if (!Number.isInteger(length) || length < 8 || length > 128)
    throw new Error('密码长度必须为 8–128')
  const classes = Array.from(new Set(selected)).map((id) => {
    if (!Object.hasOwn(groups, id)) throw new Error('字符分类无效')
    return excludeAmbiguous ? groups[id].replace(/[01ilIOo]/g, '') : groups[id]
  })
  if (!classes.length) throw new Error('至少选择一组字符')
  if (!globalThis.crypto?.getRandomValues) throw new Error('需要安全上下文和浏览器安全随机数')
  const alphabet = classes.join(''),
    limit = 256 - (256 % alphabet.length)
  for (let attempt = 0; attempt < 1024; attempt++) {
    let result = ''
    while (result.length < length) {
      const bytes = crypto.getRandomValues(new Uint8Array(128))
      for (const byte of bytes) {
        if (byte < limit) result += alphabet[byte % alphabet.length]
        if (result.length === length) break
      }
    }
    if (classes.every((chars) => Array.from(result).some((c) => chars.includes(c)))) return result
  }
  throw new Error('无法生成符合规则的密码，请重试')
}
