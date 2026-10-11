import { createBackup } from '../lib/backups'
createBackup()
  .then((info) => console.log(JSON.stringify(info, null, 2)))
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
