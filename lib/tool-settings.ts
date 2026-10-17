import { getDatabase,getSiteSettings,isEnabled } from './db'
import { REGISTERED_TOOLS,type ToolSettings,type ToolId } from './tools'
function store(){const db=getDatabase();db.exec('CREATE TABLE IF NOT EXISTS tool_settings(id TEXT PRIMARY KEY,json TEXT NOT NULL)');return db}
function defaults():ToolSettings[]{const site=getSiteSettings();return [
 {id:'password',enabled:true,title:site.passwordToolTitle,description:site.passwordToolDescription,seoTitle:site.passwordToolTitle,seoDescription:site.passwordToolDescription,help:'密码在浏览器本地随机生成，不上传、不保存。请妥善保存到自己的密码管理器。'},
 {id:'convert',enabled:true,title:'文档转换',description:'Markdown、HTML 与 Word（DOCX）转换，文件只在浏览器内处理。',seoTitle:'Markdown、HTML 与 Word 转换',seoDescription:'本地完成 Markdown 与 DOCX、HTML 转换，支持导出纯文本，不上传文档。',help:'支持 Markdown → 纯文本、HTML、DOCX，以及 HTML/DOCX → Markdown。仅支持 .docx，不支持旧版 .doc、宏和加密文件；复杂排版可能变化，图片以说明文字保留，不读取外部资源。文本最多 20 万字，DOCX 最多 5 MiB，解压总量最多 20 MiB。转换超过 15 秒可取消或自动终止，请下载后复核。'},
 {id:'ip',enabled:true,title:'IP 信息查询',description:'查询公网 IPv4 / IPv6 的归属地与网络信息。',seoTitle:'公网 IPv4 与 IPv6 信息查询',seoDescription:'查询当前公网 IP 或指定公网 IP 的网络及大致归属地。',help:'点击查询才会访问 IPQuery；待查询 IP 会发送给该第三方，主站不保存查询记录。内网、回环和保留地址不会发送。归属地来自数据库估算，不代表精确位置；第三方故障时显示失败。'}
]}
export function validateTools(value:unknown):ToolSettings[]{
 if(!Array.isArray(value)||value.length!==REGISTERED_TOOLS.length)throw Error('工具配置不完整')
 const result=value.map((p:ToolSettings)=>{if(!p||!REGISTERED_TOOLS.some(t=>t.id===p.id)||Object.keys(p).some(k=>!['id','enabled','title','description','seoTitle','seoDescription','help'].includes(k))||typeof p.enabled!=='boolean')throw Error('工具配置无效');for(const key of ['title','description','seoTitle','seoDescription','help'] as const)if(typeof p[key]!=='string'||p[key].length>(key==='help'?3000:key.includes('escription')?500:120)||(['title','seoTitle'].includes(key)&&!p[key].trim()))throw Error('工具名称、帮助或 SEO 长度无效');return {...p,title:p.title.trim(),seoTitle:p.seoTitle.trim()}})
 if(new Set(result.map(p=>p.id)).size!==REGISTERED_TOOLS.length)throw Error('工具配置重复');return result
}
export function getToolSettings():ToolSettings[]{const rows=store().prepare('SELECT id,json FROM tool_settings').all() as {id:string;json:string}[];const base=defaults();return base.map(tool=>{try{const row=rows.find(r=>r.id===tool.id);return row?validateTools(base.map(t=>t.id===tool.id?JSON.parse(row.json):t)).find(t=>t.id===tool.id)!:tool}catch{return tool}})}
export function saveToolSettings(value:unknown){const settings=validateTools(value),db=store();db.transaction(()=>{for(const tool of settings)db.prepare('INSERT INTO tool_settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(tool.id,JSON.stringify(tool))})();return settings}
export function toolEnabled(id:ToolId){return isEnabled('tools')&&getToolSettings().some(t=>t.id===id&&t.enabled)}
export function publicTools(){return isEnabled('tools')?getToolSettings().filter(t=>t.enabled).map(t=>({...t,path:REGISTERED_TOOLS.find(r=>r.id===t.id)!.path})):[]}
