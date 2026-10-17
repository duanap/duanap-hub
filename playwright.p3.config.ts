import {defineConfig} from '@playwright/test'
import base from './playwright.config'
const hub=base.webServer as {command:string;url:string;env:Record<string,string>}
const directory=process.env.HUB_TEST_P3_DIR||=hub.env.HUB_DATA_DIR
export default defineConfig({...base,testMatch:'**/p3-*.spec.ts',testIgnore:[],webServer:[
 {command:'node tests/helpers/github-fixture.mjs',url:'http://127.0.0.1:1034/health',reuseExistingServer:false,env:{HUB_GITHUB_FIXTURE:'1'}},
 {...hub,env:{...hub.env,HUB_DATA_DIR:directory,HUB_GITHUB_ALLOW_LOOPBACK:'1',HUB_GITHUB_TEST_BASE:'http://127.0.0.1:1034/'}}
]})
