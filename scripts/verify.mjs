import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const cwd = resolve(process.cwd())
const required = [
  'README.md',
  'AGENTS.md',
  'package.json',
  '.env.example',
  '.gitignore',
  'docs/ROADMAP-V1.1.md',
  'docs/REQUIREMENTS-V1.0.md',
  'docs/ARCHITECTURE.md',
  'docs/ACCEPTANCE.md',
  'docs/REPOSITORY.md',
  'app/page.tsx',
  'app/robots.ts',
  'app/sitemap.ts',
  'app/feed.xml/route.ts',
  'app/duanap/page.tsx',
  'app/duanap/login/page.tsx',
  'app/api/studio/login/route.ts',
  'app/api/studio/projects/route.ts',
  'lib/db.ts',
  'lib/admin-auth.ts',
  'lib/modules.ts',
  'components/Studio.tsx',
  'scripts/hash-password.mjs',
]
const issues = []
for (const file of required) if (!existsSync(join(cwd, file))) issues.push(`缺少文件: ${file}`)
if (existsSync(join(cwd, '.github', 'workflows'))) issues.push('当前基线不包含 GitHub Actions 目录')
try {
  const p = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  for (const key of ['next', 'react', 'better-sqlite3'])
    if (!p.dependencies?.[key]) issues.push(`缺少必要依赖: ${key}`)
} catch (e) {
  issues.push(`package.json 读取失败: ${e}`)
}
if (process.argv.includes('--package') && existsSync(join(cwd, 'data')))
  issues.push('发行包不得包含 data/ 持久化目录')
function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory() ? walk(join(dir, x.name)) : [join(dir, x.name)],
  )
}
const sources = walk(join(cwd, 'app'))
  .concat(walk(join(cwd, 'components')), walk(join(cwd, 'lib')))
  .filter((x) => /\.tsx?$/.test(x))
// Use TypeScript parser if available, either local after npm install or global in the build environment.
const require = createRequire(import.meta.url)
let ts = null
try {
  ts = require('typescript')
} catch {
  try {
    ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js')
  } catch {}
}
if (ts) {
  for (const source of sources) {
    const text = readFileSync(source, 'utf8')
    const type = source.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const file = ts.createSourceFile(source, text, ts.ScriptTarget.ES2022, true, type)
    for (const diag of file.parseDiagnostics || [])
      issues.push(
        `TypeScript 语法错误: ${source.replace(cwd, '')} - ${ts.flattenDiagnosticMessageText(diag.messageText, ' ')}`,
      )
  }
}
for (const script of walk(join(cwd, 'scripts')).filter((f) => /\.mjs$/.test(f))) {
  const checked = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' })
  if (checked.status !== 0)
    issues.push(
      `脚本检查失败: ${script.replace(cwd, '')} ${checked.error?.message || checked.stderr?.split('\n')[0] || '无法启动检查子进程'}`,
    )
}
if (issues.length) {
  console.error(`结构检查失败（${issues.length}项）：`)
  issues.forEach((x) => console.error(' - ' + x))
  process.exit(1)
}
console.log(
  `结构检查通过：${required.length} 个关键文件；${sources.length} 个 TS/TSX 文件${ts ? ' 已解析语法' : '（尚未安装 TypeScript，跳过 AST 解析）'}`,
)
console.log('注意：结构检查不替代 npm run typecheck、npm run build 和浏览器验收。')
