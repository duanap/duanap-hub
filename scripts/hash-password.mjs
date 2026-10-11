import { randomBytes, scryptSync } from 'node:crypto'
import { stdin, stdout } from 'node:process'

function maskedInput(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
      reject(new Error('需要交互式终端，请在 Windows PowerShell 或本地终端运行。'))
      return
    }
    stdout.write(prompt)
    let value = ''
    stdin.setEncoding('utf8')
    stdin.setRawMode(true)
    stdin.resume()
    const clean = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
    }
    const onData = (data) => {
      for (const char of data) {
        if (char === '\u0003') {
          clean()
          stdout.write('\n')
          reject(new Error('已取消'))
          return
        }
        if (char === '\r' || char === '\n') {
          clean()
          stdout.write('\n')
          resolve(value)
          return
        }
        if (char === '\u007f' || char === '\b') {
          if (value.length) {
            value = value.slice(0, -1)
            stdout.write('\b \b')
          }
        } else if (char >= ' ' && value.length < 200) {
          value += char
          stdout.write('*')
        }
      }
    }
    stdin.on('data', onData)
  })
}

try {
  const first = await maskedInput('设置后台密码（至少12位）：')
  const second = await maskedInput('再次输入确认：')
  if (first.length < 12 || first.length > 200 || first !== second)
    throw new Error('密码不一致或长度不符合要求')
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(first, Buffer.from(salt, 'hex'), 64).toString('hex')
  console.log('\n复制下面这一行到 .env.local：\n')
  console.log(`HUB_ADMIN_PASSWORD_HASH=scrypt$${salt}$${derived}`)
  console.log('\n密码本身未写入文件。')
} catch (error) {
  console.error(error instanceof Error ? error.message : '操作失败')
  process.exitCode = 1
}
