import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { updateSiteSettings } from '@/lib/db'
import { validateSettingsPatch } from '@/lib/config'
export const runtime = 'nodejs'
export async function PUT(request: Request) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    return NextResponse.json({
      settings: updateSiteSettings(validateSettingsPatch(await parseJson(request, 80_000))),
    })
  } catch (e) {
    return apiError(e)
  }
}
