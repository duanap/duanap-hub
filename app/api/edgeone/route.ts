import {NextResponse} from 'next/server'
import {isEnabled} from '@/lib/db'
import {refreshEdgeone} from '@/lib/edgeone'
export const runtime='nodejs'
export async function GET(){
  const headers={'Cache-Control':'no-store'}
  if(!isEnabled('edgeone'))return NextResponse.json({error:'模块未启用'},{status:404,headers})
  try{const snapshot=await refreshEdgeone();return isEnabled('edgeone')?NextResponse.json({snapshot},{headers}):NextResponse.json({error:'模块未启用'},{status:404,headers})}
  catch{return NextResponse.json({error:'EdgeOne 暂不可用'},{status:503,headers})}
}
