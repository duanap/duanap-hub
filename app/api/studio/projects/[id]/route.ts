import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { apiError, parseJson } from '@/lib/api'
import { deleteProject, listProjects, updateProject } from '@/lib/db'
export const runtime='nodejs'
type Params={params:Promise<{id:string}>}
const projectId=(s:string)=>{const n=Number(s);if(!Number.isSafeInteger(n)||n<1)throw new Error('项目 ID 无效');return n}
export async function PATCH(request:Request,context:Params){
  const deny=await guardAdminMutation(request);if(deny)return deny
  try{const id=projectId((await context.params).id);return NextResponse.json({project:updateProject(id,await parseJson(request,35_000)),projects:listProjects()})}
  catch(e){return apiError(e)}
}
export async function DELETE(request:Request,context:Params){
  const deny=await guardAdminMutation(request);if(deny)return deny
  try{deleteProject(projectId((await context.params).id));return NextResponse.json({ok:true,projects:listProjects()})}
  catch(e){return apiError(e)}
}
