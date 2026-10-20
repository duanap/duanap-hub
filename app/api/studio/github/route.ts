import {NextResponse} from 'next/server'
import {hasAdminSession,guardAdminMutation} from '@/lib/admin-auth'
import {apiError,parseJson} from '@/lib/api'
import {getGithubSettings,saveGithubSettings,githubSnapshot,refreshGithub} from '@/lib/github'
const headers={'Cache-Control':'private, no-store'}
export async function GET(){return await hasAdminSession()?NextResponse.json({settings:getGithubSettings(),snapshot:githubSnapshot()},{headers}):NextResponse.json({error:'请先登录'},{status:401,headers})}
export async function PUT(request:Request){const deny=await guardAdminMutation(request);if(deny)return deny;try{return NextResponse.json({settings:saveGithubSettings(await parseJson(request,3000))},{headers})}catch(e){return apiError(e)}}
export async function POST(request:Request){const deny=await guardAdminMutation(request);if(deny)return deny;try{return NextResponse.json({snapshot:await refreshGithub(true)},{headers})}catch(e){return apiError(e)}}
