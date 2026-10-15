import { defineConfig } from '@playwright/test'
import base from './playwright.config'
const server=base.webServer as {command:string;url:string;env:Record<string,string>}
export default defineConfig({...base,testMatch:'**/qq-login.spec.ts',webServer:{...server,env:{...server.env,HUB_ACCOUNTS_ENABLED:'0',HUB_QQ_LOGIN_ENABLED:process.env.HUB_TEST_QQ_LOGIN==='1'?'1':'0',HUB_WORDPRESS_URL:process.env.HUB_TEST_QQ_WORDPRESS_URL||'https://qq-blog-fixture.invalid/wordpress/'}}})
