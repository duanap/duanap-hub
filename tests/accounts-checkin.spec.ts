import { test,expect } from '@playwright/test'
import { enableAccounts,loginAccount,accountOrigin } from './helpers/accounts'
test.beforeEach(async({request})=>enableAccounts(request))
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
test('checkin requires authenticated origin and CSRF and rejects identity overrides',async({playwright})=>{
  const user=await playwright.request.newContext({baseURL:accountOrigin})
  expect((await user.post('/api/account/checkin',{data:{businessDate:date()}})).status()).toBe(401)
  const {me}=await loginAccount(user,'bob')
  expect((await user.post('/api/account/checkin',{data:{businessDate:date()}})).status()).toBe(403)
  expect((await user.post('/api/account/checkin',{headers:{Origin:'https://wrong.invalid','X-Hub-CSRF':me.csrfToken},data:{businessDate:date()}})).status()).toBe(403)
  expect((await user.post('/api/account/checkin',{headers:{Origin:accountOrigin,'X-Hub-CSRF':me.csrfToken},data:{businessDate:date(),user_id:1}})).status()).toBe(400)
  expect((await user.post('/api/account/checkin?user_id=1',{headers:{Origin:accountOrigin,'X-Hub-CSRF':me.csrfToken},data:{businessDate:date()}})).status()).toBe(400)
  await user.dispose()
})
test('separate requests replay one receipt and return authoritative actual balance',async({request})=>{
  const {me}=await loginAccount(request,'bob'),headers={Origin:accountOrigin,'X-Hub-CSRF':me.csrfToken}
  const first=await request.post('/api/account/checkin',{headers:{...headers,'X-Request-ID':'first'},data:{businessDate:date()}})
  expect(first.status()).toBe(200);const a=await first.json();expect(a.status).toBe('success');expect(a.balance).toBe(205)
  const again=await request.post('/api/account/checkin',{headers:{...headers,'X-Request-ID':'retry'},data:{businessDate:date()}})
  const b=await again.json();expect(b.status).toBe('already');expect(b.receipt).toBe(a.receipt)
  expect((await (await request.get('/api/account/checkin/result?businessDate='+date())).json()).receipt).toBe(a.receipt)
  expect(JSON.stringify(a)).not.toContain('MUST_NOT_LEAK')
})
test('lost response is queried without automatically repeating a write',async({page,request})=>{
  await loginAccount(page.request,'bob');await page.goto('/account')
  await expect(page.getByRole('button',{name:'签到',exact:true})).toBeEnabled()
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'checkin-lost-response'}})
  await page.getByRole('button',{name:'签到',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('尚未确认')
  await page.route('**/api/account/checkin',async route=>{
    if(route.request().method()!=='GET')return route.continue()
    const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),canCheckin:false}})
  })
  await page.getByRole('button',{name:'刷新',exact:true}).click()
  await expect(page.getByRole('button',{name:'查询签到结果'})).toBeEnabled()
  await page.getByRole('button',{name:'查询签到结果'}).click()
  await expect(page.getByRole('status')).toContainText('已确认签到')
  await expect(page.locator('.account-balance')).toHaveText('205')
  expect((await (await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'normal'}})).json()).writeCalls).toBe(1)
})
test('processing and absent receipt never pretend that points arrived',async({page,request})=>{
  await loginAccount(page.request,'bob');await page.goto('/account')
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'checkin-processing'}})
  await page.getByRole('button',{name:'签到',exact:true}).click();await expect(page.getByRole('status')).toContainText('处理中')
  await expect(page.locator('.account-balance')).toHaveText('200')
  await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'normal'}})
  await page.getByRole('button',{name:'查询签到结果'}).click();await expect(page.getByRole('status')).toContainText('尚无签到回执')
  await expect(page.getByRole('button',{name:'签到',exact:true})).toBeEnabled()
})
test('malformed committed result stays unknown and Core is usable',async({request})=>{
  const {me}=await loginAccount(request,'bob')
  for(const mode of ['checkin-invalid','checkin-invalid-receipt']){
    await request.post('http://127.0.0.1:1031/__fixture/control',{data:{mode}})
    const response=await request.post('/api/account/checkin',{headers:{Origin:accountOrigin,'X-Hub-CSRF':me.csrfToken},data:{businessDate:date()}})
    expect(response.status()).toBe(503);expect((await response.json()).error).toContain('尚未确认')
  }
  expect((await request.get('/')).status()).toBe(200);expect((await request.get('/sitemap.xml')).status()).toBe(200)
})
