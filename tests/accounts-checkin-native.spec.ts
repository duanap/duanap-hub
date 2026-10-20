import { test,expect } from '@playwright/test'
import path from 'node:path'
test('native button adapter adds action proof before the existing click handler reads form data',async({page})=>{
  await page.setContent('<a class="initiate-checkin" form-action="user_checkin" form-data="{&quot;existing&quot;:1}"><span>签到</span></a><script type="application/json" id="duanap-hub-checkin-config">{"nonce":"fixture-nonce"}</script>')
  await page.addScriptTag({path:path.resolve('integrations/wordpress/duanap-hub-bridge/assets/checkin.js')})
  await page.evaluate(()=>document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('a'):null
    if(button)document.body.dataset.nativePayload=button.getAttribute('form-data')||''
  }))
  await page.getByText('签到',{exact:true}).click()
  expect(JSON.parse(await page.locator('body').getAttribute('data-native-payload')||'{}')).toEqual({existing:1,_wpnonce:'fixture-nonce'})
})
