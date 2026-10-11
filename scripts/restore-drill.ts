import { restoreBackup } from '../lib/backups'
const args = process.argv.slice(2),
  source = args[args.indexOf('--backup') + 1],
  target = args[args.indexOf('--target') + 1]
if (!args.includes('--backup') || !args.includes('--target') || !source || !target) {
  console.error(
    'Usage: pnpm restore:drill --backup <snapshot-directory-or-json> --target <new-directory>',
  )
  process.exitCode = 1
} else
  restoreBackup(source, target)
    .then((result) => console.log(JSON.stringify({ target, ...result }, null, 2)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
