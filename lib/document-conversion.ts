import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
export type ConversionMode='text'|'html'|'docx'|'html-markdown'|'docx-markdown'
export type ConversionResult={text:string;blob?:Blob;extension:string;warnings:string}
type Node={type:string;value?:string;url?:string;alt?:string;depth?:number;ordered?:boolean;children?:Node[];tagName?:string}
const MAX_TEXT=200_000
const url=(value='')=>{try{const parsed=new URL(value);return ['https:','http:','mailto:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password?parsed.href:''}catch{return ''}}
const escape=(value='')=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
function checkTree(root:Node){let count=0;const visit=(n:Node,depth:number)=>{if(++count>20000||depth>60)throw Error('文档结构过于复杂');for(const child of n.children||[])visit(child,depth+1)};visit(root,0)}
function plain(n:Node):string{if(n.type==='image')return n.alt?'[图片：'+n.alt+']':'';if(n.type==='html')return (n.value||'').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,'');if(n.value!==undefined)return n.value;const value=(n.children||[]).map(plain).join(n.type==='tableRow'?'\t':['root','list','blockquote','table'].includes(n.type)?'\n':'');return value+(['paragraph','heading','code','listItem'].includes(n.type)?'\n':'')}
function html(n:Node):string{
 const children=(n.children||[]).map(html).join('')
 switch(n.type){case 'text':return escape(n.value);case 'inlineCode':return '<code>'+escape(n.value)+'</code>';case 'code':return '<pre><code>'+escape(n.value)+'</code></pre>';case 'html':return escape(n.value);case 'paragraph':return '<p>'+children+'</p>';case 'heading':return '<h'+n.depth+'>'+children+'</h'+n.depth+'>';case 'strong':return '<strong>'+children+'</strong>';case 'emphasis':return '<em>'+children+'</em>';case 'delete':return '<del>'+children+'</del>';case 'link':return url(n.url)?'<a rel="noreferrer noopener" href="'+escape(url(n.url))+'">'+children+'</a>':children;case 'image':return escape(n.alt?'[图片：'+n.alt+']':'');case 'blockquote':return '<blockquote>'+children+'</blockquote>';case 'list':return '<'+(n.ordered?'ol':'ul')+'>'+children+'</'+(n.ordered?'ol':'ul')+'>';case 'listItem':return '<li>'+children+'</li>';case 'thematicBreak':return '<hr>';case 'break':return '<br>';case 'table':return '<table>'+children+'</table>';case 'tableRow':return '<tr>'+children+'</tr>';case 'tableCell':return '<td>'+children+'</td>';default:return children}
}
async function fromHtml(input:string){
 const [{default:parse},{default:bridge},{default:stringify}]=await Promise.all([import('rehype-parse'),import('rehype-remark'),import('remark-stringify')])
 const remove=(n:Node)=>{if(n.children)n.children=n.children.filter(c=>!['script','style','iframe','object','embed','form','input','link','meta','base','video','audio','source'].includes(c.tagName||'')).map(c=>{remove(c);return c})}
 const links=(n:Node)=>{if((n.type==='image'||n.type==='link'&&!url(n.url))){n.type='text';n.value=(n.children||[]).map(plain).join('')||n.alt||'';delete n.children;delete n.url}for(const c of n.children||[])links(c)}
 return String(await unified().use(parse,{fragment:true}).use(()=>tree=>{checkTree(tree as unknown as Node);remove(tree as unknown as Node)}).use(bridge).use(remarkGfm).use(()=>tree=>links(tree as unknown as Node)).use(stringify).process(input))
}
async function validateDocx(buffer:ArrayBuffer){
 if(buffer.byteLength>5*1024*1024||buffer.byteLength<22)throw Error('DOCX 大小须在 5 MiB 以内')
 const {Unzip,UnzipInflate}=await import('fflate');let total=0,count=0,document=false,contentTypes=false
 const unzip=new Unzip(file=>{
  if(++count>1000||file.name.startsWith('/')||file.name.includes('\\')||file.name.split('/').includes('..')||/vbaProject|activeX/i.test(file.name)||!['0','8'].includes(String(file.compression))||(file.originalSize||0)>10*1024*1024)throw Error('不支持此 DOCX 容器或宏内容')
  document ||= file.name==='word/document.xml';contentTypes ||= file.name==='[Content_Types].xml';let size=0
  file.ondata=(error,data)=>{if(error)throw Error('DOCX 压缩数据损坏');size+=data.length;total+=data.length;if(size>10*1024*1024||total>20*1024*1024){file.terminate();throw Error('DOCX 解压内容超过 20 MiB 上限')}};file.start()
 });unzip.register(UnzipInflate);const bytes=new Uint8Array(buffer);for(let at=0;at<bytes.length;at+=16*1024)unzip.push(bytes.subarray(at,at+16*1024),at+16*1024>=bytes.length)
 if(!document||!contentTypes)throw Error('文件不是有效 DOCX 文档')
}
async function toWord(root:Node){
 const d=await import('docx')
 const runs=(n:Node,bold=false,italics=false):InstanceType<typeof d.TextRun>[]=>n.children?n.children.flatMap(c=>runs(c,bold||n.type==='strong',italics||n.type==='emphasis')):[new d.TextRun({text:n.type==='image'?'[图片：'+(n.alt||'未命名')+']':n.value||'',bold,italics,font:n.type==='inlineCode'?'Consolas':undefined})]
 const blocks=(nodes:Node[]):(InstanceType<typeof d.Paragraph>|InstanceType<typeof d.Table>)[]=>nodes.flatMap(n=>{
  if(n.type==='table')return [new d.Table({rows:(n.children||[]).map(row=>new d.TableRow({children:(row.children||[]).map(cell=>new d.TableCell({children:[new d.Paragraph({children:runs(cell)})]}))}))})]
  if(n.type==='list')return (n.children||[]).map((item,i)=>new d.Paragraph({children:[new d.TextRun(n.ordered?(i+1)+'. ':'• '),...runs(item)]}))
  if(n.type==='blockquote')return blocks(n.children||[])
  if(n.type==='heading')return [new d.Paragraph({heading:([d.HeadingLevel.HEADING_1,d.HeadingLevel.HEADING_2,d.HeadingLevel.HEADING_3,d.HeadingLevel.HEADING_4,d.HeadingLevel.HEADING_5,d.HeadingLevel.HEADING_6])[Math.min(6,n.depth||1)-1],children:runs(n)})]
  return [new d.Paragraph({children:n.type==='code'?[new d.TextRun({text:n.value||'',font:'Consolas'})]:runs(n)})]
 })
 return d.Packer.toBlob(new d.Document({sections:[{children:blocks(root.children||[])}]}))
}
export async function convertDocument(mode:ConversionMode,text:string,buffer?:ArrayBuffer):Promise<ConversionResult>{
 if(!['text','html','docx','html-markdown','docx-markdown'].includes(mode)||text.length>MAX_TEXT)throw Error('转换模式无效或文本超过 20 万字')
 const warnings='基础文字、标题、列表和表格可转换；图片不下载，复杂排版请在下载后复核。'
 if(mode==='docx-markdown'){
  if(!buffer)throw Error('请选择 DOCX 文件');await validateDocx(buffer)
  const mammoth=(await import('mammoth')).default,result=await mammoth.convertToHtml({arrayBuffer:buffer},{externalFileAccess:false,includeEmbeddedStyleMap:false,convertImage:mammoth.images.imgElement(async()=>({src:''}))})
  if(result.value.length>1_000_000)throw Error('转换结果过大');const value=await fromHtml(result.value);if(value.length>MAX_TEXT)throw Error('转换结果超过 20 万字');return {text:value,extension:'md',warnings}
 }
 if(mode==='html-markdown')return {text:await fromHtml(text),extension:'md',warnings}
 const root=unified().use(remarkParse).use(remarkGfm).parse(text) as unknown as Node;checkTree(root)
 if(mode==='text')return {text:plain(root).trim(),extension:'txt',warnings}
 if(mode==='docx')return {text:plain(root).trim(),blob:await toWord(root),extension:'docx',warnings}
 return {text:'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>转换文档</title><style>body{max-width:900px;margin:40px auto;padding:20px;line-height:1.8;font-family:system-ui}table,td{border:1px solid #888;border-collapse:collapse;padding:8px}pre{white-space:pre-wrap}</style><body>'+html(root)+'</body></html>',extension:'html',warnings}
}
