import { test } from 'node:test'
import assert from 'node:assert/strict'

test('Unicode Base64 round trips and rejects malformed input', async () => {
  const t = await import('../lib/tool-functions')
  assert.equal(t.decodeBase64(t.encodeBase64('中文 🚀')), '中文 🚀')
  assert.throws(() => t.decodeBase64('%%%'))
  assert.throws(() => t.decodeBase64('/w=='))
})
test('IP checker validates complete IPv4 and IPv6 without external lookup', async () => {
  const t = await import('../lib/tool-functions')
  assert.equal(t.inspectIP('192.168.1.2').kind, '私有地址')
  assert.equal(t.inspectIP('::1').version, 6)
  assert.equal(t.inspectIP('::ffff:192.168.1.2').kind, 'IPv4 映射地址')
  assert.equal(t.inspectIP('::192.168.1.2').kind, 'IPv4 兼容地址（已弃用）')
  assert.equal(t.inspectIP('198.51.101.1').kind, '公网地址格式（未查询归属地）')
  assert.equal(t.inspectIP('203.0.114.1').kind, '公网地址格式（未查询归属地）')
  assert.throws(() => t.inspectIP('256.2.3.4'))
  assert.throws(() => t.inspectIP('1::2::3'))
  assert.throws(() => t.inspectIP('1:2:3:4:5:6:7:8:9'))
})
test('time conversions are explicit about Beijing timezone and invalid dates', async () => {
  const t = await import('../lib/tool-functions')
  assert.equal(t.beijingToUnix('1970-01-01T08:00'), 0)
  assert.equal(t.unixToISO('0', 'seconds'), '1970-01-01T00:00:00.000Z')
  assert.throws(() => t.beijingToUnix('2026-02-30T12:00'))
  assert.throws(() => t.unixToISO('abc', 'seconds'))
})
test('passwords obey selected character classes and reject impossible selections', async () => {
  const t = await import('../lib/tool-functions')
  const p = t.generatePassword(20, ['lower', 'digit'], true)
  assert.equal(p.length, 20)
  assert.match(p, /[a-z]/)
  assert.match(p, /[2-9]/)
  assert.doesNotMatch(p, /[01ilO]/)
  assert.throws(() => t.generatePassword(20, [], false))
})
