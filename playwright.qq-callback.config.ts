import { defineConfig } from '@playwright/test'
import base from './playwright.config'
const server=base.webServer as {command:string;url:string;env:Record<string,string>}
const mode=process.env.HUB_TEST_QQ_CALLBACK
export default defineConfig({...base,testMatch:'**/qq-callback.spec.ts',webServer:{...server,env:{...server.env,HUB_ACCOUNTS_ENABLED:'0',HUB_ACCOUNTS_ALLOW_LOOPBACK:mode==='browser'?'1':'0',HUB_WORDPRESS_URL:mode==='browser'?'http://127.0.0.1:1031/wordpress/':mode==='1'?'https://qq-blog-fixture.invalid/wordpress/':''}}})
