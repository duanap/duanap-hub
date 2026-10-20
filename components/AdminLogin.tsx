'use client'
import { useState } from 'react'
export function AdminLogin(){
  const[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function submit(e:React.FormEvent){
    e.preventDefault()
    // Password managers may fill the DOM without firing React input events.
    const form=new FormData(e.currentTarget as HTMLFormElement)
    const username=form.get('username'),password=form.get('password')
    setBusy(true);setError('')
    try{const response=await fetch('/api/studio/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})})
      const data=await response.json();if(!response.ok)throw new Error(data.error||'登录失败');window.location.assign('/duanap')
    }catch(err){setError(err instanceof Error?err.message:'登录失败')}finally{setBusy(false)}
  }
  return <main className="login-screen"><form className="login-card" onSubmit={submit}>
    <div className="brand-icon">d.</div><span className="eyebrow">DUANAP STUDIO</span><h1>管理你的个人空间</h1><p>独立管理员登录，和未来的普通用户 QQ 账号分离。</p>
    <label className="field"><span>管理员</span><input name="username" autoComplete="username" defaultValue="duanap" required/></label>
    <label className="field"><span>密码</span><input name="password" type="password" autoComplete="current-password" required minLength={12}/></label>
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <button className="action-primary login-submit" type="submit" disabled={busy}>{busy?'验证中…':'登录工作台 →'}</button>
    <a href="/" className="subtle-link">← 返回网站</a>
  </form></main>
}
