import {NextResponse} from 'next/server'
import {isEnabled} from '@/lib/db'
import {refreshGithub} from '@/lib/github'
export async function GET(){const headers={'Cache-Control':'no-store'};if(!isEnabled('github'))return NextResponse.json({error:'模块未启用'},{status:404,headers});try{const snapshot=await refreshGithub();return isEnabled('github')?NextResponse.json({snapshot},{headers}):NextResponse.json({error:'模块未启用'},{status:404,headers})}catch{return NextResponse.json({error:'GitHub 暂不可用'},{status:503,headers})}}
