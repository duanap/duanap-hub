import { NextResponse } from 'next/server'
import { accountConfig } from '@/lib/accounts/config'
import { currentAccount,guardAccountMutation,privateHeaders,accountFailure } from '@/lib/accounts/session'
import { deleteAccountSession } from '@/lib/accounts/store'
import { revokeWordPressToken } from '@/lib/accounts/wordpress'
export const runtime='nodejs'
export async function POST(request:Request){
  try{
    const config=accountConfig(),current=await currentAccount(config)
    guardAccountMutation(request,config,current)
    const removed=deleteAccountSession(config,current)
    const upstreamRevoked=removed?await revokeWordPressToken(config,removed.accessToken):false
    const response=NextResponse.json({ok:true,upstreamRevoked},{headers:privateHeaders})
    return response
  }catch(error){return accountFailure(error)}
}
