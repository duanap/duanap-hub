import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { PasswordGenerator } from '@/components/PasswordGenerator'
import { isEnabled } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
export function generateMetadata():Metadata{return pageMetadata('安全密码生成器','使用浏览器加密安全随机数生成自定义强密码，结果不会上传。','/tools/password',isEnabled('tools'))}
export default function PasswordPage(){if(!isEnabled('tools'))notFound();return <PublicShell><div className="page-heading"><span className="eyebrow">LOCAL SECURITY</span><h1>安全密码生成器</h1><p>使用浏览器的加密安全随机数生成密码，结果只留在当前页面。</p></div><PasswordGenerator/></PublicShell>}
