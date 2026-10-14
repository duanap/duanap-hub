import { accountCheckin } from '@/lib/accounts/checkin'
export const runtime='nodejs'
export const GET=(request:Request)=>accountCheckin(request,false)
