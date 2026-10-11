import { spawn } from 'node:child_process'
import { createProject, createEntry } from '../lib/db'
if (!process.env.HUB_TEST_PASSWORD || !process.env.HUB_DATA_DIR?.includes('e2e-'))
  throw new Error('Only isolated E2E data is allowed')
const p = createProject({
  slug: 'acceptance-project',
  title: '验收用项目',
  summary: '仅供自动化验收，不是线上运营数据。',
  body: '## 项目内容\n\n真实服务端渲染的验收正文。',
  category: 'game',
  status: 'maintenance',
  version: 'test-v1',
  published: true,
  coverUrl: '/assets/hero-game-rabbit.webp',
  featured: true,
})
createEntry({
  projectId: p.id,
  title: '验收日志',
  type: 'changelog',
  body: '测试记录',
  published: true,
})
createEntry({
  projectId: p.id,
  title: '验收计划',
  type: 'roadmap',
  body: '计划记录',
  published: true,
})
const child = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    ...(process.env.HUB_E2E_PRODUCTION === '1' ? ['start'] : ['dev', '--webpack']),
    '-H',
    '127.0.0.1',
    '-p',
    '1027',
  ],
  { stdio: 'inherit', env: process.env },
)
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    child.kill(signal)
    process.exit()
  })
child.on('exit', (code) => process.exit(code ?? 1))
