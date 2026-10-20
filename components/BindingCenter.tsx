'use client'
import Link from 'next/link'
import { useEffect,useState } from 'react'
import type { Bindings } from '@/lib/accounts/wordpress'
export function BindingCenter(){
  const [data,setData]=useState<Bindings|null>(null),[error,setError]=useState('')
  useEffect(()=>{
    const abort=new AbortController()
    void (async()=>{try{
      const me=await fetch('/api/account/me',{cache:'no-store',signal:abort.signal}),identity=await me.json()
      if(!me.ok)throw new Error(identity.error||'请先登录')
      const response=await fetch('/api/account/bindings',{cache:'no-store',signal:abort.signal}),body=await response.json()
      if(!response.ok)throw new Error(body.error||'绑定信息暂不可用')
      if(body.hubUid!==identity.user.hubUid)throw new Error('账号已变化，请重新进入本页')
      if(!abort.signal.aborted)setData(body)
    }catch(e){if(!abort.signal.aborted){setData(null);setError(e instanceof Error?e.message:'绑定信息暂不可用')}}})()
    return()=>abort.abort()
  },[])
  return <section className="account-center"><div className="page-heading"><span className="eyebrow">ACCOUNT</span><h1>账号绑定与恢复</h1><p>绑定由博客统一维护。操作前需要近期重新验证，至少保留一种可用登录方式。</p></div>
    <Link href="/account">返回账号中心</Link>
    {error&&<p role="status" className="account-message">{error}</p>}
    {data?<><div className="account-grid">{data.providers.map(item=><div className="account-card" key={item.provider}><h2>{item.name}</h2><p>{item.legacyReview?'原有绑定需要核实应用来源':item.linked?'已绑定':item.configured?'尚未绑定':'应用未配置'}</p></div>)}</div>
      <div className="account-card"><h2>安全管理</h2><p>昵称相同或邮箱相同不会合并账号。已有身份被占用时拒绝覆盖。</p><a className="button" href={data.managementUrl}>前往博客验证并管理绑定</a><p>{data.passwordReady?'当前博客密码已验证，可作为备用登录方式。':'尚未验证备用密码；自动生成的社交账号密码不算可用方式。'}</p><a href={data.recoveryUrl}>博客账号恢复</a></div></>:!error&&<p>正在读取本人绑定信息…</p>}
  </section>
}
