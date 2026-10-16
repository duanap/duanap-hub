import { defineConfig } from '@playwright/test'
import base from './playwright.config'
const hub=base.webServer as {command:string;url:string;env:Record<string,string>}
const directory=process.env.HUB_TEST_CONTENT_DIR||=hub.env.HUB_DATA_DIR
export default defineConfig({...base,testMatch:'**/content.spec.ts',testIgnore:[],webServer:[
  {command:'node tests/helpers/content-fixture.mjs',url:'http://127.0.0.1:1033/health',reuseExistingServer:false,env:{HUB_CONTENT_FIXTURE:'1'}},
  {...hub,env:{...hub.env,HUB_DATA_DIR:directory,HUB_CONTENT_WORDPRESS_URL:'http://127.0.0.1:1033/',HUB_CONTENT_ALLOW_LOOPBACK:'1'}}
]})
