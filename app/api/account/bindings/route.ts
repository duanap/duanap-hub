import { accountResource } from '@/lib/accounts/resources'
export const runtime='nodejs'
export const GET=(request:Request)=>accountResource(request,'bindings')
