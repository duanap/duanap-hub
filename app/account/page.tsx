import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isEnabled } from '@/lib/db'
import { PublicShell } from '@/components/PublicShell'
import { AccountCenter } from '@/components/AccountCenter'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:'账号中心',robots:{index:false,follow:false},alternates:{canonical:'/account'}}
export default function AccountPage(){
  if(process.env.HUB_ACCOUNTS_ENABLED!=='1'||!isEnabled('accounts'))notFound()
  return <PublicShell><AccountCenter /></PublicShell>
}
