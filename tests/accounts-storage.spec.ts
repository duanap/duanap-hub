import { test,expect } from '@playwright/test'
import path from 'node:path'
import Database from 'better-sqlite3'
import { enableAccounts,loginAccount,accountOrigin } from './helpers/accounts'

// Destructive fault applies only to this final synthetic test and its random data dir.
test('corrupt identity schema disables only account operations',async({playwright,request})=>{
  await enableAccounts(request)
  const user=await playwright.request.newContext({baseURL:accountOrigin});await loginAccount(user)
  const directory=process.env.HUB_TEST_ACCOUNTS_DATA_DIR!
  if(!path.basename(directory).startsWith('accounts-e2e-'))throw new Error('Only synthetic account directories are permitted')
  const db=new Database(path.join(directory,'accounts.sqlite'));db.exec('DROP TABLE sessions');db.close()
  expect((await user.get('/api/account/me')).status()).toBe(503)
  expect((await request.get('/')).status()).toBe(200)
  expect((await request.put('/api/studio/site',{headers:{Origin:accountOrigin},data:{tagline:'Core 仍可写入'}})).status()).toBe(200)
  await user.dispose()
})
