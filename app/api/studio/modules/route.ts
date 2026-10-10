import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { reorderModules, setModuleEnabled } from '@/lib/db'
export const runtime='nodejs'
export async function PATCH(request:Request){
  const deny=await guardAdminMutation(request);if(deny)return deny
  try{
    const p=await parseJson(request,3000) as Record<string,unknown>
    if(Array.isArray(p.order) && p.order.every(x=>typeof x==='string'))return NextResponse.json({modules:reorderModules(p.order)})
    if(typeof p.id!=='string'||typeof p.enabled!=='boolean')throw new Error('无效的模块操作')
    return NextResponse.json({modules:setModuleEnabled(p.id,p.enabled)})
  }catch(e){return apiError(e)}
}
