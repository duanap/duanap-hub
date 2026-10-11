import { test } from 'node:test'
import assert from 'node:assert/strict'
test('public dates and scheduled content use the Beijing calendar across UTC midnight', async () => {
  const { businessDay } = await import('../lib/dates')
  assert.equal(businessDay('2026-10-10T16:30:00Z'), '2026-10-11')
  assert.equal(businessDay('2026-10-10T15:59:59Z'), '2026-10-10')
})
