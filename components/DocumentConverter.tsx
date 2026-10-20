'use client'
import {useEffect,useRef,useState} from 'react'
import type {ConversionMode,ConversionResult} from '@/lib/document-conversion'
export function DocumentConverter(){
 const [mode,setMode]=useState<ConversionMode>('html'),[text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[result,setResult]=useState<ConversionResult|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef(0)
 function stop(){generation.current++;worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;setBusy(false)}
 useEffect(()=>()=>{worker.current?.terminate();if(timer.current)clearTimeout(timer.current)},[])
 async function convert(){
  stop();const version=generation.current;setResult(null);setNotice('');setBusy(true)
  try{
   if(mode==='docx-markdown'&&(!file||!file.name.toLowerCase().endsWith('.docx')||file.size>5*1024*1024))throw Error('请选择不超过 5 MiB 的 .docx 文件')
   if(mode!=='docx-markdown'&&(!text.trim()||text.length>200000))throw Error('请填写 20 万字以内的文本')
   const buffer=mode==='docx-markdown'?await file!.arrayBuffer():undefined;if(version!==generation.current)return
   const task=new Worker(new URL('./workers/document.worker.ts',import.meta.url),{type:'module'});worker.current=task
   const fail=(message:string)=>{if(version===generation.current){stop();setNotice(message)}}
   task.onerror=()=>fail('转换进程异常，请重试或简化文档')
   task.onmessage=event=>{if(version!==generation.current)return;if(event.data.ready===true){task.postMessage({mode,text,buffer},buffer?[buffer]:[]);return}if(event.data.error){fail(event.data.error);return}if(!event.data.result)return;setResult(event.data.result);setNotice('转换完成，请检查结果后下载');stop()}
   timer.current=setTimeout(()=>fail('转换超过 15 秒，已终止；请简化文档后重试'),15000)
  }catch(error){if(version===generation.current){stop();setNotice(error instanceof Error?error.message:'转换失败')}}
 }
 function download(){if(!result)return;const blob=result.blob||new Blob([result.text],{type:result.extension==='html'?'text/html;charset=utf-8':'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='converted.'+result.extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <section className="content-card document-tool"><label>转换方式<select value={mode} disabled={busy} onChange={e=>{setMode(e.target.value as ConversionMode);setResult(null);setNotice('')}}><option value="html">Markdown → HTML</option><option value="text">Markdown → 纯文本</option><option value="docx">Markdown → Word（DOCX）</option><option value="html-markdown">HTML → Markdown</option><option value="docx-markdown">Word（DOCX）→ Markdown</option></select></label>
 {mode==='docx-markdown'?<label>选择 DOCX 文件<input type="file" accept=".docx" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null)}}/></label>:<label>输入文本<textarea rows={12} maxLength={200000} value={text} disabled={busy} onChange={e=>{setText(e.target.value);setResult(null)}}/></label>}
 <div className="tool-actions"><button className="action-primary" disabled={busy} onClick={()=>void convert()}>{busy?'转换中…':'开始转换'}</button>{busy&&<button onClick={()=>{stop();setNotice('转换已取消')}}>取消转换</button>}{result&&<button onClick={download}>下载结果</button>}</div>
 {notice&&<p role="status">{notice}</p>}{result&&<><p className="form-hint">{result.warnings}</p><label>转换结果<textarea aria-label="转换结果" rows={12} readOnly value={result.text}/></label></>}
 <p className="form-hint">主站不会上传文档，也不会主动保存文档或转换记录。生成的 HTML 以源代码显示，不在页面内执行。</p></section>
}
