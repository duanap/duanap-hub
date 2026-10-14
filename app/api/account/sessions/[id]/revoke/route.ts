import { NextResponse } from 'next/server'
import { accountConfig,AccountError } from '@/lib/accounts/config'
import { currentAccount,guardAccountMutation,privateHeaders,accountFailure } from '@/lib/accounts/session'
import { deleteAccountSession } from '@/lib/accounts/store'
import { revokeWordPressToken } from '@/lib/accounts/wordpress'
export const runtime='nodejs'
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const config=accountConfig(),current=await currentAccount(config)
    guardAccountMutation(request,config,current)
    const {id}=await params
    if(!/^[0-9a-f-]{36}$/.test(id))throw new AccountError(404,'session_not_found','会话不存在')
    const removed=deleteAccountSession(config,current,id)
    if(!removed)throw new AccountError(404,'session_not_found','会话不存在')
    const upstreamRevoked=await revokeWordPressToken(config,removed.accessToken)
    const response=NextResponse.json({ok:true,upstreamRevoked},{headers:privateHeaders})
    return response
  }catch(error){return accountFailure(error)}
}
