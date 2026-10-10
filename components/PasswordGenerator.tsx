'use client'
import { useState } from 'react'

const classes=[
  {id:'lower',label:'小写字母',chars:'abcdefghjkmnpqrstuvwxyz'},
  {id:'upper',label:'大写字母',chars:'ABCDEFGHJKMNPQRSTUVWXYZ'},
  {id:'digit',label:'数字',chars:'23456789'},
  {id:'symbol',label:'特殊符号',chars:'!@#$%^&*-_+'}
]

function randomPassword(length:number,alphabet:string):string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('当前环境缺少安全随机数接口')
  if (!alphabet) throw new Error('至少选择一组字符')
  const result:string[]=[]
  const limit=256-(256%alphabet.length)
  while(result.length<length){
    const bytes=new Uint8Array(Math.max(32,length))
    crypto.getRandomValues(bytes)
    for(const byte of bytes){
      if(byte<limit)result.push(alphabet[byte%alphabet.length])
      if(result.length===length)break
    }
  }
  return result.join('')
}
export function PasswordGenerator(){
  const[length,setLength]=useState(20)
  const[selected,setSelected]=useState<string[]>(['lower','upper','digit','symbol'])
  const[password,setPassword]=useState('')
  const[message,setMessage]=useState('')
  const generate=()=>{
    try{
      const alphabet=classes.filter(x=>selected.includes(x.id)).map(x=>x.chars).join('')
      setPassword(randomPassword(length,alphabet))
      setMessage('已在浏览器本地生成')
    }catch(error){setMessage(error instanceof Error?error.message:'生成失败')}
  }
  return <section className="content-card generator-card">
    <label className="field"><span>密码长度：{length}</span><input type="range" min="8" max="64" value={length} onChange={e=>setLength(Number(e.target.value))}/></label>
    <div className="check-grid">{classes.map(c=><label className="check-choice" key={c.id}><input type="checkbox" checked={selected.includes(c.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,c.id]:old.filter(x=>x!==c.id))}/><span>{c.label}</span></label>)}</div>
    <div className="password-output"><output aria-live="polite">{password||'点击生成密码'}</output></div>
    <div className="hero-actions"><button className="action-primary" type="button" onClick={generate}>生成密码</button><button className="action-secondary" type="button" disabled={!password} onClick={async()=>{try{await navigator.clipboard.writeText(password);setMessage('已复制')}catch{setMessage('复制失败，可手动选择文本')}}}>复制</button></div>
    <p className="form-hint" role="status">{message||'此工具不会把密码发送给服务器。'}</p>
  </section>
}
