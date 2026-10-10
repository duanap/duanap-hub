import { redirect } from 'next/navigation'
import { hasAdminSession } from '@/lib/admin-auth'
import { AdminLogin } from '@/components/AdminLogin'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const metadata={title:'登录 duanap Studio',robots:{index:false,follow:false}}
export default async function LoginPage(){if(await hasAdminSession())redirect('/duanap');return <AdminLogin/>}
