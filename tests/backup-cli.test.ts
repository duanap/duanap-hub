import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
test('backup command reads .env.local storage configuration instead of backing up the wrong directory', () => {
  const project = process.cwd(),
    root = mkdtempSync(path.join(tmpdir(), 'hub-cli-env-')),
    configured = path.join(root, 'configured-storage')
  writeFileSync(
    path.join(root, '.env.local'),
    'HUB_DATA_DIR=' + configured.replaceAll('\\', '/') + '\n',
  )
  const script = (
    JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8')).scripts.backup as string
  )
    .split(' ')
    .slice(1)
  script[script.length - 1] = path.join(project, script.at(-1)!)
  const env = { ...process.env }
  delete env.HUB_DATA_DIR
  const result = spawnSync(
    process.execPath,
    [
      path.join(project, 'node_modules/tsx/dist/cli.mjs'),
      '--tsconfig',
      path.join(project, 'tsconfig.json'),
      ...script,
    ],
    { cwd: root, env, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const backup = JSON.parse(result.stdout)
  assert.ok(
    backup.directory.startsWith(configured),
    'Backup must use the configured storage directory',
  )
})
