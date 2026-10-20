import {notFound} from 'next/navigation'
import {PublicShell} from '@/components/PublicShell'
import {DocumentConverter} from '@/components/DocumentConverter'
import {IPLookup} from '@/components/IPLookup'
import {getToolSettings,toolEnabled} from '@/lib/tool-settings'
import {pageMetadata} from '@/lib/seo'
type Context={params:Promise<{tool:string}>}
export async function generateMetadata({params}:Context){const {tool}=await params;if(tool!=='convert'&&tool!=='ip')return {};const settings=getToolSettings().find(t=>t.id===tool)!;return pageMetadata(settings.seoTitle,settings.seoDescription,'/tools/'+tool,toolEnabled(tool))}
export default async function ToolPage({params}:Context){const {tool}=await params;if((tool!=='convert'&&tool!=='ip')||!toolEnabled(tool))notFound();const settings=getToolSettings().find(t=>t.id===tool)!;return <PublicShell><div className="page-heading"><span className="eyebrow">UTILITY KIT</span><h1>{settings.title}</h1><p>{settings.description}</p></div>{tool==='convert'?<DocumentConverter/>:<IPLookup/>}<section className="content-card tool-help"><h2>使用说明</h2><p>{settings.help}</p></section></PublicShell>}
