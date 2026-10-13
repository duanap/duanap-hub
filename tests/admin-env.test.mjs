import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { adminHashEnvLine } from '../scripts/hash-password.mjs'

test('generated administrator hash survives Next environment file expansion', () => {
  const salt = randomBytes(16), derived = scryptSync(randomBytes(24).toString('hex'), salt, 64).toString('hex')
  const expected = `scrypt$${salt.toString('hex')}$${derived}`
  const directory = mkdtempSync(path.join(os.tmpdir(), 'hub-admin-env-'))
  writeFileSync(path.join(directory, '.env.local'), adminHashEnvLine(salt.toString('hex'), derived) + '\n')
  const environment = { ...process.env }; delete environment.HUB_ADMIN_PASSWORD_HASH
  const result = spawnSync(process.execPath, ['-e', "require('@next/env').loadEnvConfig(process.argv[1]); console.log(JSON.stringify({ matches: process.env.HUB_ADMIN_PASSWORD_HASH === process.argv[2] }))", directory, expected], { env: environment, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout.trim()).matches, true, 'Next must load the complete scrypt hash, including both dollar delimiters')
})
