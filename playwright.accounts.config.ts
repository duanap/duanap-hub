import { defineConfig } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import base from './playwright.config'
const client='hub-fixture',secret=process.env.HUB_TEST_ACCOUNTS_SECRET||=randomBytes(32).toString('base64url')
const key=process.env.HUB_TEST_ACCOUNTS_KEY||=randomBytes(32).toString('base64url')
const directory=process.env.HUB_TEST_ACCOUNTS_DATA_DIR||=path.resolve('.tmp','accounts-e2e-'+randomBytes(8).toString('hex'))
const clock=process.env.HUB_TEST_ACCOUNTS_CLOCKFILE||=path.join(directory,'test-clock.txt')
const hub=base.webServer as {command:string;url:string;env:Record<string,string>}
export default defineConfig({...base,testMatch:'**/accounts*.spec.ts',testIgnore:[],webServer:[
  {command:'node tests/helpers/oauth-fixture.mjs',url:'http://127.0.0.1:1031/health',reuseExistingServer:false,env:{HUB_ACCOUNTS_FIXTURE:'1',HUB_WORDPRESS_CLIENT_ID:client,HUB_WORDPRESS_CLIENT_SECRET:secret}},
  {...hub,command:'node --import ./tests/helpers/accounts-clock.mjs '+hub.command.slice(5),env:{...hub.env,HUB_DATA_DIR:directory,HUB_TEST_ACCOUNTS_CLOCKFILE:clock,HUB_ACCOUNTS_ENABLED:'1',HUB_CHECKIN_ENABLED:process.env.HUB_TEST_CHECKIN_ENABLED??'1',HUB_ACCOUNTS_ALLOW_LOOPBACK:'1',HUB_WORDPRESS_URL:'http://127.0.0.1:1031/',HUB_WORDPRESS_CLIENT_ID:client,HUB_WORDPRESS_CLIENT_SECRET:secret,HUB_ACCOUNTS_TOKEN_KEY:key}}
]})
