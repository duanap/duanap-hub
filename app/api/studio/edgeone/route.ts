import {NextResponse} from 'next/server'
import {hasAdminSession,guardAdminMutation} from '@/lib/admin-auth'
import {apiError,parseJson} from '@/lib/api'
import {getEdgeoneSettings,saveEdgeoneSettings,edgeoneSnapshot,refreshEdgeone,edgeoneConfiguration} from '@/lib/edgeone'
export const runtime='nodejs'
const headers={'Cache-Control':'private, no-store'}
export async function GET(){return await hasAdminSession()?NextResponse.json({settings:getEdgeoneSettings(),snapshot:edgeoneSnapshot(),configuration:edgeoneConfiguration()},{headers}):NextResponse.json({error:'请先登录'},{status:401,headers})}
export async function PUT(request:Request){const deny=await guardAdminMutation(request);if(deny)return deny;try{return NextResponse.json({settings:saveEdgeoneSettings(await parseJson(request,4000)),snapshot:edgeoneSnapshot()},{headers})}catch(e){return apiError(e)}}
export async function POST(request:Request){const deny=await guardAdminMutation(request);if(deny)return deny;try{return NextResponse.json({snapshot:await refreshEdgeone(true),configuration:edgeoneConfiguration()},{headers})}catch(e){return apiError(e)}}
