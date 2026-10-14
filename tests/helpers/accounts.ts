import { expect,type APIRequestContext } from '@playwright/test'
export const accountOrigin='http://127.0.0.1:1027'
export async function enableAccounts(admin:APIRequestContext){
  await admin.post('http://127.0.0.1:1031/__fixture/control',{data:{mode:'normal',lifetime:3600}})
  await admin.post('/api/studio/login',{headers:{Origin:accountOrigin},data:{username:'duanap',password:process.env.HUB_TEST_ADMIN_PASSWORD}})
  expect((await admin.patch('/api/studio/modules',{headers:{Origin:accountOrigin},data:{id:'accounts',enabled:true}})).status()).toBe(200)
}
export async function beginAccount(client:APIRequestContext){
  const login=await client.get('/api/auth/login',{maxRedirects:0})
  expect(login.status()).toBe(303)
  return login.headers().location
}
export async function authorizeAccount(client:APIRequestContext,authorize:string,user='alice'){
  const url=new URL(authorize);url.searchParams.set('fixtureUser',user)
  const response=await client.get(url.href,{maxRedirects:0})
  expect(response.status()).toBe(302)
  return response.headers().location
}
export async function loginAccount(client:APIRequestContext,user='alice'){
  const callback=await authorizeAccount(client,await beginAccount(client),user)
  const response=await client.get(callback,{maxRedirects:0})
  expect(response.status()).toBe(303);expect(response.headers().location).toBe(accountOrigin+'/account')
  const me=await client.get('/api/account/me');expect(me.status()).toBe(200)
  return {callback,me:await me.json()}
}
