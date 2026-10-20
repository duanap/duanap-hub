import {defineConfig} from '@playwright/test'
import {mkdirSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import base from './playwright.config'
const hub=base.webServer as {command:string;url:string;env:Record<string,string>}
const directory=process.env.HUB_TEST_EDGEONE_DIR||=hub.env.HUB_DATA_DIR
mkdirSync(directory,{recursive:true})
const credential=path.join(directory,'fixture-credential.json')
writeFileSync(credential,JSON.stringify({secretId:'fixture-id',secretKey:'fixture-secret-MUST_NOT_LEAK'}),{mode:0o600})
export default defineConfig({...base,testMatch:'**/edgeone.spec.ts',testIgnore:[],webServer:[
 {command:'node tests/helpers/edgeone-fixture.mjs',url:'http://127.0.0.1:1035/health',reuseExistingServer:false,env:{HUB_EDGEONE_FIXTURE:'1'}},
 {...hub,command:'node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 1027',env:{...hub.env,HUB_DATA_DIR:directory,HUB_EDGEONE_ZONE_ID:'zone-fixture',HUB_EDGEONE_CREDENTIAL_FILE:credential,HUB_EDGEONE_ALLOW_LOOPBACK:'1',HUB_EDGEONE_TEST_BASE:'http://127.0.0.1:1035/'}}
]})
