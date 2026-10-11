import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { scryptSync } from 'node:crypto'

test('password setup produces a hash that survives the real Next.js dotenv loader', async () => {
  const { createPasswordEnvLine } = await import('../scripts/hash-password.mjs')
  const directory = mkdtempSync(path.join(tmpdir(), 'hub-password-env-'))
  try {
    const password = 'temporary-regression-password'
    writeFileSync(path.join(directory, '.env.local'), createPasswordEnvLine(password))
    const require = createRequire(import.meta.url)
    const nextRequire = createRequire(require.resolve('next/package.json'))
    const loader = nextRequire.resolve('@next/env')
    const env = { ...process.env }
    delete env.HUB_ADMIN_PASSWORD_HASH
    const child = spawnSync(
      process.execPath,
      [
        '-e',
        `require(${JSON.stringify(loader)}).loadEnvConfig(process.argv[1]); process.stdout.write(process.env.HUB_ADMIN_PASSWORD_HASH || '')`,
        directory,
      ],
      { env, encoding: 'utf8' },
    )
    assert.equal(child.status, 0, child.stderr)
    const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(child.stdout)
    assert.ok(match, 'Next.js must preserve the complete hash')
    assert.equal(scryptSync(password, Buffer.from(match[1], 'hex'), 64).toString('hex'), match[2])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
