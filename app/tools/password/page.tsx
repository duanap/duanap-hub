import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { PasswordGenerator } from '@/components/PasswordGenerator'
import { isEnabled, getSiteSettings } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
import {getToolSettings,toolEnabled} from '@/lib/tool-settings'
export function generateMetadata():Metadata{const tool=getToolSettings().find(t=>t.id==='password')!;return pageMetadata(tool.seoTitle,tool.seoDescription,'/tools/password',toolEnabled('password'))}
export default function PasswordPage(){if(!toolEnabled('password'))notFound();const tool=getToolSettings().find(t=>t.id==='password')!;return <PublicShell><div className="page-heading"><span className="eyebrow">LOCAL SECURITY</span><h1>{tool.title}</h1><p>{tool.description}</p></div><PasswordGenerator/><section className="content-card tool-help"><h2>使用说明</h2><p>{tool.help}</p></section></PublicShell>}
