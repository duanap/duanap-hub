import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isEnabled } from '@/lib/db'
import { PublicShell } from '@/components/PublicShell'
import { BindingCenter } from '@/components/BindingCenter'
import { MemberCenter } from '@/components/MemberCenter'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:'账号绑定与恢复',robots:{index:false,follow:false}}
export default function BindingsPage(){
  if(process.env.HUB_ACCOUNTS_ENABLED!=='1'||!isEnabled('accounts'))notFound()
  return <PublicShell>{process.env.HUB_LOCAL_ACCOUNTS_ENABLED==='1'?<MemberCenter />:<BindingCenter />}</PublicShell>
}
