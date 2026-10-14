import { accountResource } from '@/lib/accounts/resources'
import { accountCheckin } from '@/lib/accounts/checkin'
export const runtime='nodejs'
export const GET=(request:Request)=>accountResource(request,'checkin')
export const POST=(request:Request)=>accountCheckin(request,true)
