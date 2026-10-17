import { NextResponse } from 'next/server'
import { hasAdminSession,guardAdminMutation } from '@/lib/admin-auth'
import { parseJson,apiError } from '@/lib/api'
import { getToolSettings,saveToolSettings } from '@/lib/tool-settings'
const headers={'Cache-Control':'private, no-store'}
export async function GET(){return await hasAdminSession()?NextResponse.json({tools:getToolSettings()},{headers}):NextResponse.json({error:'请先登录'},{status:401,headers})}
export async function PUT(request:Request){const deny=await guardAdminMutation(request);if(deny)return deny;try{return NextResponse.json({tools:saveToolSettings(await parseJson(request,20000))},{headers})}catch(e){return apiError(e)}}
