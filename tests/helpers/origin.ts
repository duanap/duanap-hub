export const testPort = Number(process.env.HUB_TEST_PORT || 1027)
if (!Number.isInteger(testPort) || testPort < 1024 || testPort > 65535) throw Error('Invalid local test port')
export const testOrigin = 'http://127.0.0.1:' + testPort
