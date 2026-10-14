'use client'
import { useCallback,useEffect,useRef,useState } from 'react'
import Link from 'next/link'
import type { AccountIdentity,Points,Checkin,History } from '@/lib/accounts/wordpress'
type Session={id:string;createdAt:number;expiresAt:number;current:boolean}
type Profile={user:AccountIdentity;csrfToken:string;expiresAt:number;blogUrl:string}
type View={points?:Points;checkin?:(Checkin&{canCheckin?:boolean});history?:History;sessions?:Session[]}
export function AccountCenter(){
  const [profile,setProfile]=useState<Profile|null>(null),[view,setView]=useState<View>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [auth,setAuth]=useState<string|null>(null)
  const [checkinNotice,setCheckinNotice]=useState<{uid:string;text:string}|null>(null)
  const [pendingCheckin,setPendingCheckin]=useState<{uid:string;date:string}|null>(null)
  const sequence=useRef(0),pending=useRef<AbortController|null>(null)
  const refresh=useCallback(async()=>{
    const version=++sequence.current
    pending.current?.abort();const controller=new AbortController();pending.current=controller
    setBusy(true);setProfile(null);setAuth(null);setView({});setError('')
    try{
      const response=await fetch('/api/account/me',{cache:'no-store',signal:controller.signal}),data=await response.json()
      if(!response.ok)throw new Error(data.error||'账号服务暂不可用')
      if(version!==sequence.current)return
      // Keep only the action nonce while building a consistent private snapshot.
      setAuth(data.csrfToken)
      const paths={points:'/api/account/points',checkin:'/api/account/checkin',history:'/api/account/points/history',sessions:'/api/account/sessions'}
      const results=await Promise.all(Object.entries(paths).map(async([kind,path])=>{
        const r=await fetch(path,{cache:'no-store',signal:controller.signal}),body=await r.json()
        if(!r.ok){if(version===sequence.current&&(r.status===401||r.status===403))setAuth(null);throw new Error(body.error||'账号数据暂不可用')}
        if(body.hubUid!==data.user.hubUid){if(version===sequence.current)setAuth(null);throw new Error('账号已变化，请重新刷新')}
        return [kind,kind==='sessions'?body.sessions:body] as const
      }))
      if(version===sequence.current){setProfile(data);setView(Object.fromEntries(results))}
    }catch(cause){if(version===sequence.current&&!(cause instanceof DOMException&&cause.name==='AbortError')){setProfile(null);setView({});setError(cause instanceof Error?cause.message:'账号服务暂不可用')}}
    finally{if(version===sequence.current)setBusy(false)}
  },[])
  useEffect(()=>{void refresh();const focus=()=>void refresh();window.addEventListener('focus',focus);return()=>{sequence.current++;pending.current?.abort();window.removeEventListener('focus',focus)}},[refresh])
  async function revoke(id?:string){
    if(!auth)return
    const version=++sequence.current;pending.current?.abort();setBusy(true);setError('')
    try{
      const response=await fetch(id?`/api/account/sessions/${id}/revoke`:'/api/auth/logout',{method:'POST',headers:{'X-Hub-CSRF':auth},cache:'no-store'}),data=await response.json()
      if(!response.ok)throw new Error(data.error||'退出失败，请刷新后重试')
      if(version!==sequence.current)return
      if(!id||view.sessions?.find(s=>s.id===id)?.current){setProfile(null);setAuth(null);setView({});setError(data.upstreamRevoked?'已退出主站，博客登录仍由博客管理':'已退出主站；博客授权撤销尚未确认，请在博客账号页管理')}
      else await refresh()
    }catch(cause){if(version===sequence.current)setError(cause instanceof Error?cause.message:'操作未完成')}
    finally{if(version===sequence.current)setBusy(false)}
  }
  async function checkinAction(query=false){
    if(!profile||!auth||!view.checkin)return
    const uid=profile.user.hubUid,businessDate=pendingCheckin?.uid===uid?pendingCheckin.date:view.checkin.businessDate
    const version=++sequence.current;pending.current?.abort();setBusy(true);setError('')
    setPendingCheckin({uid,date:businessDate});setCheckinNotice(null)
    try{
      const response=await fetch(query?'/api/account/checkin/result?'+new URLSearchParams({businessDate}):'/api/account/checkin',query?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Hub-CSRF':auth},body:JSON.stringify({businessDate}),cache:'no-store'})
      const result=await response.json()
      if(version!==sequence.current)return
      if(!response.ok)throw new Error(result.error||'签到结果尚未确认，请先查询结果')
      if(result.hubUid!==uid||result.businessDate!==businessDate)throw new Error('账号或签到日期已变化，请重新查询')
      if(result.status==='processing'){setCheckinNotice({uid,text:'签到处理中，请稍后查询结果'});return}
      if(result.status==='not_recorded'){setPendingCheckin(null);setCheckinNotice({uid,text:'尚无签到回执，可以再次签到；跨日时请先刷新'});return}
      if(result.status!=='success'&&result.status!=='already')throw new Error('签到结果尚未确认，请先查询结果')
      setPendingCheckin(null);setCheckinNotice({uid,text:`已确认签到，本次记录实际积分 +${result.pointsAwarded}`})
      await refresh()
    }catch(cause){if(version===sequence.current)setCheckinNotice({uid,text:cause instanceof Error?cause.message:'签到结果尚未确认，请先查询结果'})}
    finally{if(version===sequence.current)setBusy(false)}
  }
  return <section className="account-center">
    <div className="section-heading"><div><p className="eyebrow">ACCOUNT</p><h1>账号中心</h1><p>使用博客已有账号，查看权威积分与签到记录。</p></div><button type="button" onClick={()=>void refresh()} disabled={busy}>刷新</button></div>
    {error&&<p className="account-message" role="status">{error}</p>}
    {!profile?<div className="account-card"><h2>博客账号登录</h2><p>QQ、站内账号与已有绑定在博客登录页处理。主站不收集博客密码。</p><a className="button" href="/api/auth/login">使用博客账号登录</a> {auth&&<button disabled={busy} onClick={()=>void revoke()}>退出现有主站会话</button>}<p className="muted">授权到期后需要重新登录。Studio 管理员登录独立。</p></div>:<>
      <div className="account-card"><div className="account-profile">{profile.user.avatarUrl?<img src={profile.user.avatarUrl} alt="博客头像" referrerPolicy="no-referrer"/>:<span aria-hidden="true">{profile.user.displayName.slice(0,1)}</span>}<h2>{profile.user.displayName}</h2></div><p className="account-uid">UID：{profile.user.hubUid}</p><p>主站会话有效至 {new Date(profile.expiresAt*1000).toLocaleString('zh-CN')}</p><button disabled={busy} onClick={()=>void revoke()}>退出主站</button> <a href={profile.blogUrl} rel="noreferrer">前往博客管理账号</a></div>
      <div className="account-grid"><div className="account-card"><h2>积分余额</h2><p className="account-balance">{view.points?view.points.balance:'—'}</p><p className="muted">{view.points?`读取于 ${new Date(view.points.asOf).toLocaleString('zh-CN')}`:'等待博客返回数据'}</p></div>
      <div className="account-card"><h2>签到状态</h2><p>{view.checkin?(view.checkin.checkedIn?'今日已签到':'今日未签到'):'等待博客返回数据'}</p>{view.checkin&&<p>北京时间 {view.checkin.businessDate} · 连续 {view.checkin.continuousDays} 天 · 累计 {view.checkin.totalDays} 天</p>}
        {pendingCheckin?.uid===profile.user.hubUid?<button disabled={busy} onClick={()=>void checkinAction(true)}>查询签到结果</button>:view.checkin?.canCheckin?<button disabled={busy||view.checkin.checkedIn} onClick={()=>void checkinAction()}>签到</button>:<p className="muted">签到请使用博客原有入口。</p>}
        <p className="muted">未确认结果时先查询；积分以博客实际记录为准。</p>
        {checkinNotice?.uid===profile.user.hubUid&&<p role="status">{checkinNotice.text}</p>}
      </div></div>
      <div className="account-card"><h2>近期积分流水</h2>{view.history?<><div className="account-table-wrap"><table><thead><tr><th>时间</th><th>原因</th><th>变化</th><th>余额</th></tr></thead><tbody>{view.history.items.map((item,index)=><tr key={index}><td>{new Date(item.occurredAt).toLocaleString('zh-CN')}</td><td>{item.reason}</td><td>{item.delta>0?'+':''}{item.delta}</td><td>{item.balanceAfter}</td></tr>)}</tbody></table></div><p className="muted">博客最多保留最近 {view.history.retentionLimit} 条记录，此处展示 {view.history.items.length} 条。</p></>:<p>暂未取得流水</p>}</div>
      <div className="account-card"><h2>主站会话</h2>{view.sessions?.map(item=><div className="account-session" key={item.id}><span>{item.current?'当前会话':'其他会话'} · {new Date(item.createdAt*1000).toLocaleString('zh-CN')}</span><button disabled={busy} onClick={()=>void revoke(item.id)}>撤销{item.current?'当前':'此'}会话</button></div>)}</div>
    </>}
    <p><Link href="/account/bindings">账号绑定与恢复</Link></p>
    <p className="account-privacy muted">主站只在服务器保存加密授权凭据、随机会话与必要身份信息，过期数据按请求清理，不另建积分余额。退出主站不会替你退出博客；资料修改、密码找回和第三方绑定由博客管理。</p>
  </section>
}
