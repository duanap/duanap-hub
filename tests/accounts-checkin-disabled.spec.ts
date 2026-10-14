import { test,expect } from '@playwright/test'
import { enableAccounts,loginAccount,accountOrigin } from './helpers/accounts'
test('write gate off still permits authenticated committed receipt lookup',async({page,request})=>{
  test.skip(process.env.HUB_TEST_CHECKIN_ENABLED!=='0','Run with independent write gate disabled')
  await enableAccounts(request);const {me}=await loginAccount(page.request,'bob')
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{seedCheckin:'bob'}})
  const snapshot=await (await page.request.get('/api/account/checkin')).json()
  expect(snapshot.canCheckin).toBe(false)
  expect((await page.request.post('/api/account/checkin',{headers:{Origin:accountOrigin,'X-Hub-CSRF':me.csrfToken},data:{businessDate:snapshot.businessDate}})).status()).toBe(503)
  const result=await page.request.get('/api/account/checkin/result?businessDate='+snapshot.businessDate)
  expect(result.status()).toBe(200);expect((await result.json()).status).toBe('already')
  await page.goto('/account');await expect(page.getByRole('button',{name:'签到',exact:true})).toHaveCount(0)
})
