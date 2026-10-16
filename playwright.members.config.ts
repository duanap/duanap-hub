import { defineConfig } from '@playwright/test'
import accounts from './playwright.accounts.config'
const servers=accounts.webServer as {command:string;url:string;env:Record<string,string>}[]
export default defineConfig({...accounts,testMatch:'**/members*.spec.ts',webServer:[servers[0],{command:'node tests/helpers/qq-fixture.mjs',url:'http://127.0.0.1:1032/health',reuseExistingServer:false,env:{HUB_ACCOUNTS_FIXTURE:'1'}},{...servers[1],env:{...servers[1].env,HUB_LOCAL_ACCOUNTS_ENABLED:'1',HUB_QQ_LOGIN_ENABLED:'1',HUB_QQ_APP_ID:'900000001',HUB_QQ_APP_KEY:'synthetic-qq-private-key-not-production',HUB_QQ_UNION_REALM:'fixture-developer',HUB_QQ_TEST_BASE:'http://127.0.0.1:1032/'}}]})
