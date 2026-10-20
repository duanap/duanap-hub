import { NextResponse } from 'next/server'
import { isEnabled } from '@/lib/db'
import { refreshContent } from '@/lib/content'
export const runtime='nodejs'
export async function GET(){
  if(!isEnabled('content'))return NextResponse.json({error:'博客动态未启用'},{status:404,headers:{'Cache-Control':'no-store'}})
  try{
    const snapshot=await refreshContent()
    if(!isEnabled('content'))return NextResponse.json({error:'博客动态未启用'},{status:404,headers:{'Cache-Control':'no-store'}})
    return NextResponse.json({snapshot},{headers:{'Cache-Control':'no-store'}})
  }catch{return NextResponse.json({error:'博客动态暂不可用'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
