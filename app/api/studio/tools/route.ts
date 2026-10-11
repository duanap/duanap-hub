import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { parseJson, apiError } from '@/lib/api'
import { updateTool } from '@/lib/tools'
export async function PATCH(request: Request) {
  const deny = await guardAdminMutation(request)
  if (deny) return deny
  try {
    return NextResponse.json({ tools: updateTool(await parseJson(request, 4000)) })
  } catch (e) {
    return apiError(e)
  }
}
