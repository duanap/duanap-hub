import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { PasswordGenerator } from '@/components/PasswordGenerator'
import { isEnabled, getSiteSettings } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'
export function generateMetadata():Metadata{const site=getSiteSettings();return pageMetadata(site.passwordToolTitle,site.passwordToolDescription,'/tools/password',isEnabled('tools'))}
export default function PasswordPage(){if(!isEnabled('tools'))notFound();const site=getSiteSettings();return <PublicShell><div className="page-heading"><span className="eyebrow">LOCAL SECURITY</span><h1>{site.passwordToolTitle}</h1><p>{site.passwordToolDescription}</p></div><PasswordGenerator/></PublicShell>}
