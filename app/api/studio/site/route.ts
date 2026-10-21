import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { updateSiteSettings } from '@/lib/db'
import { validateSettingsPatch } from '@/lib/config'
import { withDataLock } from '@/lib/storage'
export const runtime='nodejs'
export async function PUT(request:Request){
  const deny=await guardAdminMutation(request);if(deny)return deny
  try{const payload = validateSettingsPatch(await parseJson(request,1_000_000));return await withDataLock(async () => NextResponse.json({settings:updateSiteSettings(payload)}))}
  catch(e){return apiError(e)}
}
