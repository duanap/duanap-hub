import { NextResponse } from 'next/server'
import { guardAdminMutation,hasAdminSession } from '@/lib/admin-auth'
import { apiError,parseJson } from '@/lib/api'
import { contentSnapshot,getContentSettings,refreshContent,saveContentSettings } from '@/lib/content'
const headers={'Cache-Control':'private, no-store'}
export const runtime='nodejs'
export async function GET(){if(!await hasAdminSession())return NextResponse.json({error:'请先登录'},{status:401,headers});return NextResponse.json({settings:getContentSettings(),snapshot:contentSnapshot()},{headers})}
export async function PUT(request:Request){const deny=await guardAdminMutation(request);if(deny)return deny;try{return NextResponse.json({settings:saveContentSettings(await parseJson(request,4096))},{headers})}catch(error){return apiError(error)}}
export async function POST(request:Request){const deny=await guardAdminMutation(request);if(deny)return deny;try{return NextResponse.json({snapshot:await refreshContent(true)},{headers})}catch(error){return apiError(error)}}
