import { NextResponse } from 'next/server'
import { accountConfig } from '@/lib/accounts/config'
import { currentAccount,privateHeaders,accountFailure } from '@/lib/accounts/session'
import { listAccountSessions } from '@/lib/accounts/store'
export const runtime='nodejs'
export async function GET(){
  try{const config=accountConfig(),current=await currentAccount(config);return NextResponse.json({hubUid:current.hubUid,sessions:listAccountSessions(config,current)},{headers:privateHeaders})}
  catch(error){return accountFailure(error)}
}
