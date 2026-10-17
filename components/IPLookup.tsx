'use client'
import {useEffect,useRef,useState} from 'react'
import ipaddr from 'ipaddr.js'
type Result={ip:string;country:string;region:string;city:string;timezone:string;asn:string;isp:string;queriedAt:string}
function publicIP(value:string){
 if(typeof value!=='string'||value.length>64||!(/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value)||/^[a-f\d:.]+$/i.test(value)&&value.includes(':'))||!ipaddr.isValid(value))throw Error('请输入有效的公网 IPv4 或 IPv6，不接受网址、端口或域名')
 const ip=ipaddr.process(value);if(ip.range()!=='unicast')throw Error('内网、回环、保留或特殊用途地址不发送至第三方');return ip.toString()
}
export function IPLookup(){
 const [input,setInput]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<Result|null>(null),[error,setError]=useState('')
 const controller=useRef<AbortController|null>(null);useEffect(()=>()=>controller.current?.abort(),[])
 async function query(mine=false){
  if(!consent||busy)return;setResult(null);setError('');setBusy(true);const c=new AbortController();controller.current=c;const timer=setTimeout(()=>c.abort(),5000)
  try{
   const ip=mine?'':publicIP(input.trim()),response=await fetch('https://api.ipquery.io/'+(ip?encodeURIComponent(ip):'?format=json'),{signal:c.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',headers:{Accept:'application/json'}})
   if(!response.ok||!response.body||!response.headers.get('content-type')?.includes('json'))throw Error('第三方查询暂不可用')
   const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0
   try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>16000){await reader.cancel();throw Error('第三方响应过大')}parts.push(p.value)}}finally{reader.releaseLock()}
   const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
   const v=JSON.parse(new TextDecoder().decode(bytes)),actual=publicIP(v.ip)
   if(ip&&actual!==ip)throw Error('第三方返回的 IP 不匹配')
   const text=(v:unknown)=>typeof v==='string'?v.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,200):'—'
   if(!v.location||!v.isp)throw Error('第三方没有提供完整的查询结果')
   if(!c.signal.aborted)setResult({ip:actual,country:text(v.location.country),region:text(v.location.state),city:text(v.location.city),timezone:text(v.location.timezone),asn:text(v.isp.asn),isp:text(v.isp.isp),queriedAt:new Date().toISOString()})
  }catch(e){if(controller.current===c)setError(c.signal.aborted?'查询超时或已取消，请稍后重试':e instanceof Error?e.message:'查询失败')}
  finally{clearTimeout(timer);if(controller.current===c){controller.current=null;setBusy(false)}}
 }
 return <section className="content-card document-tool"><label>指定公网 IP<input value={input} maxLength={64} disabled={busy} onChange={e=>{setInput(e.target.value);setResult(null);setError('')}} placeholder="例如 1.1.1.1 或 2606:4700:4700::1111"/></label><label className="check-choice"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>我同意将本次查询交给 IPQuery；主站不保存查询记录</label><div className="tool-actions"><button className="action-primary" disabled={!consent||busy} onClick={()=>void query(false)}>查询指定 IP</button><button disabled={!consent||busy} onClick={()=>void query(true)}>查询我的公网 IP</button></div>{busy&&<p role="status">查询中…</p>}{error&&<p role="status">{error}</p>}{result&&<dl className="ip-result">{Object.entries({IP:result.ip,国家:result.country,地区:result.region,城市:result.city,时区:result.timezone,ASN:result.asn,网络:result.isp,查询时间:new Date(result.queriedAt).toLocaleString('zh-CN')}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>}<p className="form-hint">数据来源：<a href="https://ipquery.io/" rel="noreferrer">IPQuery</a>。归属地为数据库估算，不是精确位置。查询我的公网 IP 时第三方会看到当前网络出口地址。</p></section>
}
