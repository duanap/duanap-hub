'use client'
import { useCallback,useEffect,useRef,useState } from 'react'
import type { Member } from '@/lib/accounts/member-types'
import type { Checkin,History,Points } from '@/lib/accounts/wordpress'
type Profile={member:Member;csrfToken:string;expiresAt:number;qqConfigured:boolean;qqAutoLinkConfigured:boolean;blog:{linked:boolean;authorized:boolean;blogUid?:string;match?:string}}
type View={points?:Points;checkin?:(Checkin&{canCheckin:boolean});history?:History}
type Session={id:string;createdAt:number;current:boolean}
export function MemberCenter(){
  const [profile,setProfile]=useState<Profile|null>(null),[view,setView]=useState<View>({}),[sessions,setSessions]=useState<Session[]>([])
  const [mode,setMode]=useState<'login'|'register'|'recover'>('login'),[notice,setNotice]=useState(''),[blogError,setBlogError]=useState(''),[busy,setBusy]=useState(false)
  const [recovery,setRecovery]=useState(''),[qqReady,setQQReady]=useState(false),[autoReady,setAutoReady]=useState(false),[pendingDate,setPendingDate]=useState('')
  const sequence=useRef(0),abort=useRef<AbortController|null>(null)
  const refresh=useCallback(async()=>{
    const version=++sequence.current;abort.current?.abort();const controller=new AbortController();abort.current=controller
    setBusy(true);setProfile(null);setView({});setSessions([]);setBlogError('');setPendingDate('')
    try{
      const response=await fetch('/api/member/me',{cache:'no-store',signal:controller.signal}),data=await response.json()
      if(version!==sequence.current)return
      if(!response.ok){if(response.status===401){const status=await fetch('/api/member/status',{cache:'no-store',signal:controller.signal});const readiness=await status.json();if(version===sequence.current){setQQReady(readiness.qqConfigured===true);setAutoReady(readiness.qqAutoLinkConfigured===true)}return}throw Error(data.error||'主站账号暂不可用')}
      setProfile(data);setQQReady(data.qqConfigured);setAutoReady(data.qqAutoLinkConfigured===true)
      const sessionResponse=await fetch('/api/member/sessions',{cache:'no-store',signal:controller.signal}),sessionData=await sessionResponse.json()
      if(version!==sequence.current)return
      if(sessionResponse.ok)setSessions(sessionData.sessions)
      if(data.blog.linked&&data.blog.authorized){
        const values=await Promise.all(Object.entries({points:'/api/account/points',checkin:'/api/account/checkin',history:'/api/account/points/history'}).map(async([key,path])=>{
          const r=await fetch(path,{cache:'no-store',signal:controller.signal}),value=await r.json()
          if(!r.ok)throw Error(value.error||'博客数据暂不可用')
          if(value.hubUid!==data.blog.blogUid)throw Error('博客关联已变化，请刷新')
          return [key,value]
        }))
        if(version===sequence.current)setView(Object.fromEntries(values))
      }
    }catch(error){if(version===sequence.current&&!(error instanceof DOMException&&error.name==='AbortError'))setBlogError(error instanceof Error?error.message:'数据暂不可用')}
    finally{if(version===sequence.current)setBusy(false)}
  },[])
  useEffect(()=>{
    const url=new URL(window.location.href),query=url.searchParams
    const messages:Record<string,string>={linked:'QQ 登录成功，已核验并自动关联使用同一 QQ 的博客账号',authorized:'已通过授权关联博客账号；这不代表已核验两站为同一 QQ',manual:'主站 QQ 登录成功，暂未取得跨应用 QQ 证明，可手动授权博客',unavailable:'博客检查暂不可用，主站登录和已有博客关联保留，可稍后重试','not-found':'QQ 登录成功，此 QQ 尚未绑定博客账号；主站可正常使用','proof-missing':'博客尚未取得可信 QQ 证明，请重新授权博客 QQ；已有博客关联保留','qq-mismatch':'当前博客账号与主站使用的 QQ 不同，已有博客关联保留；请切换博客账号后重试',conflict:'该博客账号或主站已有其他关联，未更改原关联，请先核实',changed:'关联操作已撤销，请重新发起',cancelled:'博客授权已取消，主站登录和已有博客关联保留'}
    if(query.get('qq')==='failed')setNotice('QQ 授权未完成、账号冲突或关联已变化，请重试或使用主站密码')
    else if(query.get('qq')==='updated')setNotice('QQ 关联与头像已更新；更换 QQ 后请重新授权博客')
    else if(query.get('auth')==='failed')setNotice('本次博客授权未完成，主站登录和原有博客关联保留，请重试')
    else if(query.has('blog'))setNotice(messages[query.get('blog')||'']||'博客检查已结束，请查看下方关联状态')
    for(const key of ['qq','auth','blog'])query.delete(key)
    window.history.replaceState(null,'',url.pathname+url.search+url.hash)
    void refresh();return()=>{sequence.current++;abort.current?.abort()}
  },[refresh])
  async function action(path:string,body:unknown={}){
    const response=await fetch('/api/member/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(profile?{'X-Hub-CSRF':profile.csrfToken}:{})},body:JSON.stringify(body),cache:'no-store'}),data=await response.json()
    if(!response.ok)throw Error(data.error||'操作失败，请重试')
    return data
  }
  async function mutate(path:string,body:unknown={},message='已保存'){
    const version=++sequence.current;abort.current?.abort();setBusy(true);setNotice('')
    try{
      const result=await action(path,body);if(version!==sequence.current)return
      if(result.url){window.location.assign(result.url);return}
      if(result.recovery)setRecovery(result.recovery)
      if(path==='logout'){setRecovery('');setPendingDate('')}
      setNotice(message);await refresh()
    }catch(error){if(version===sequence.current)setNotice(error instanceof Error?error.message:'操作失败')}
    finally{if(version===sequence.current)setBusy(false)}
  }
  async function authSubmit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);await mutate(mode,{username:form.get('username'),password:form.get('password'),...(mode==='recover'?{recovery:form.get('recovery')}:{})},mode==='register'?'注册成功，请保存恢复密钥':mode==='recover'?'密码已重置，旧会话已失效，请保存新的恢复密钥':'登录成功')}
  async function checkin(query=false){
    if(!profile||!view.checkin)return
    const date=pendingDate||view.checkin.businessDate,uid=profile.blog.blogUid,version=++sequence.current
    abort.current?.abort();setPendingDate(date);setBusy(true);setNotice('')
    try{
      const response=await fetch(query?'/api/account/checkin/result?'+new URLSearchParams({businessDate:date}):'/api/account/checkin',query?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Hub-CSRF':profile.csrfToken},body:JSON.stringify({businessDate:date}),cache:'no-store'}),result=await response.json()
      if(version!==sequence.current)return
      if(!response.ok)throw Error(result.error||'签到尚未确认，请查询结果')
      if(result.hubUid!==uid||result.businessDate!==date)throw Error('账号或日期已变化，请刷新')
      if(['success','already'].includes(result.status)){setNotice('已确认签到，本次积分 +'+result.pointsAwarded);setPendingDate('');await refresh()}
      else if(result.status==='not_recorded'){setPendingDate('');setNotice('暂无签到回执，可以重新签到')}
      else setNotice('签到处理中，请查询结果')
    }catch(error){if(version===sequence.current)setNotice(error instanceof Error?error.message:'签到尚未确认，请查询结果')}
    finally{if(version===sequence.current)setBusy(false)}
  }
  return <section className="account-center">
    <div className="section-heading"><div><p className="eyebrow">ACCOUNT</p><h1>我的主站账号</h1><p>独立登录主站，关联博客后使用共同的签到与积分。</p></div><button disabled={busy} onClick={()=>void refresh()}>刷新账号</button></div>
    {notice&&<p role="status" className="account-message">{notice}</p>}
    {!profile&&blogError&&<p role="status" className="account-message">{blogError}</p>}
    {recovery&&<div className="account-card"><h2>请保存恢复密钥</h2><p>忘记密码时使用。仅本次显示，请保存在自己的密码管理器中，勿分享给他人。</p><output className="member-recovery">{recovery}</output><button onClick={()=>setRecovery('')}>我已保存，关闭显示</button></div>}
    {!profile?<div className="account-card member-auth"><h2>使用 QQ 登录主站</h2><p>首次登录自动创建主站账号，无需填写用户名或密码。</p>{qqReady?<a className="button" href="/api/member/qq">QQ 登录</a>:<p className="muted">QQ 登录暂未配置或启用，可使用下方主站账号登录。</p>}<p className="muted">{autoReady?'登录时检查博客账号，核验为同一 QQ 后自动关联并提示；首次可能需要补充博客 QQ 授权。':'登录后可手动授权关联博客账号。'}用户名和密码均可在登录后自行选择设置。</p><hr/><div className="member-tabs">{(['login','register','recover'] as const).map(value=><button key={value} type="button" disabled={busy} aria-pressed={mode===value} onClick={()=>{setMode(value);setNotice('')}}>{{login:'登录',register:'注册',recover:'找回密码'}[value]}</button>)}</div>
      <form onSubmit={authSubmit} key={mode}><h2>{{login:'主站账号登录',register:'注册主站账号',recover:'恢复主站账号'}[mode]}</h2><label>用户名<input name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+"/></label>
      {mode==='recover'&&<label>恢复密钥<input name="recovery" type="password" autoComplete="off" required/></label>}
      <label>{mode==='recover'?'新密码':'密码'}<input name="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={12} maxLength={200}/></label>
      <p className="muted">用户名为 3—32 位字母、数字或下划线，密码至少 12 位。注册后请保存恢复密钥。</p><button className="button" disabled={busy} type="submit">{busy?'处理中…':{login:'登录主站',register:'创建主站账号',recover:'重置密码'}[mode]}</button></form>
    </div>:<>
      <div className="account-card"><div className="account-profile">{profile.member.avatarUrl?<img src={profile.member.avatarUrl} alt="QQ 头像" referrerPolicy="no-referrer"/>:<span aria-hidden="true">{profile.member.displayName.slice(0,1)}</span>}<h2>{profile.member.displayName}</h2></div><p>用户名：{profile.member.username}</p><p className="account-uid">主站 UID：{profile.member.id}</p><button disabled={busy} onClick={()=>void mutate('logout',{},'已退出主站')}>退出主站</button></div>
      <div className="account-card"><h2>博客关联</h2><p>{profile.blog.linked?(profile.blog.match==='qq_union'?'已关联博客账号，已核验同一 QQ':'已通过授权关联博客账号，尚未核验同一 QQ'):'尚未关联博客，签到与积分尚未解锁'}</p>{profile.blog.linked&&<p className="account-uid">博客 UID：{profile.blog.blogUid}</p>}
        {profile.blog.linked&&!profile.blog.authorized&&<p>博客授权已到期，请重新授权。主站登录仍然有效。</p>}
        <button disabled={busy} onClick={()=>void mutate('blog/link')}>{profile.blog.linked?'重新授权博客':'关联博客账号'}</button>{profile.member.qqLinked&&autoReady&&<button disabled={busy} onClick={()=>void mutate('blog/link',{automatic:true})}>{profile.blog.linked?'核验并关联同一 QQ':'使用同一个 QQ 关联'}</button>}
        {profile.blog.linked&&<button disabled={busy} onClick={()=>{if(window.confirm('解除博客关联后，主站签到暂时关闭。博客账号及历史积分仍保留。'))void mutate('blog/unlink',{confirm:true},'已解除博客关联')}}>解除关联</button>}
        <p className="muted">关联时前往博客完成授权。积分、流水及签到由博客统一记录。</p>
      </div>
      {blogError&&<p className="account-message" role="status">{blogError}</p>}
      {profile.blog.linked&&<><div className="account-grid"><div className="account-card"><h2>积分余额</h2><p className="account-balance">{view.points?.balance??'—'}</p><p className="muted">{view.points?'读取于 '+new Date(view.points.asOf).toLocaleString('zh-CN'):'暂未取得博客数据'}</p></div><div className="account-card"><h2>签到</h2><p>{view.checkin?(view.checkin.checkedIn?'今日已签到':'今日未签到'):'等待博客数据'}</p>{view.checkin&&<p>{view.checkin.businessDate} · 连续 {view.checkin.continuousDays} 天</p>}{pendingDate?<button disabled={busy} onClick={()=>void checkin(true)}>查询签到结果</button>:<button disabled={busy||!view.checkin?.canCheckin||view.checkin.checkedIn} onClick={()=>void checkin()}>签到</button>}</div></div>
      <div className="account-card"><h2>近期积分流水</h2>{view.history?<div className="account-table-wrap"><table><thead><tr><th>时间</th><th>原因</th><th>变化</th><th>余额</th></tr></thead><tbody>{view.history.items.map((item,index)=><tr key={index}><td>{new Date(item.occurredAt).toLocaleString('zh-CN')}</td><td>{item.reason}</td><td>{item.delta}</td><td>{item.balanceAfter}</td></tr>)}</tbody></table></div>:<p>暂未取得流水</p>}</div></>}
      <div className="account-card member-auth"><h2>资料与 QQ 头像</h2><form key={profile.member.id+profile.member.displayName+profile.member.avatarSource} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void mutate('profile',{displayName:form.get('displayName'),avatarSource:form.get('avatarSource')})}}><label>昵称<input name="displayName" defaultValue={profile.member.displayName} required maxLength={80}/></label><label>头像来源<select name="avatarSource" defaultValue={profile.member.avatarSource}><option value="qq">自动使用 QQ 头像</option><option value="initials">使用昵称首字</option></select></label><button disabled={busy}>保存资料</button></form><p className="muted">选择 QQ 头像后，在下一次 QQ 授权登录时更新；没有高清头像时使用小图。</p>{qqReady&&profile.member.qqLinked&&<button disabled={busy} onClick={()=>void mutate('qq/connect')}>重新授权 QQ 并更新头像</button>}</div>
      {qqReady&&<div className="account-card member-auth"><h2>QQ 账号管理</h2><p>{profile.member.qqLinked?'当前已关联 QQ':'当前未关联 QQ'}</p>{profile.member.passwordReady?<form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget),operation=String(form.get('operation')||'connect');if(operation==='unlink'&&!window.confirm('确认解除 QQ？主站账号保留，其他主站会话将撤销，博客需重新授权。'))return;void mutate('qq/'+operation,{password:form.get('qqPassword'),...(operation==='unlink'?{confirm:true}:{})},'QQ 关联已解除，其他主站会话已撤销');const input=event.currentTarget.elements.namedItem('qqPassword') as HTMLInputElement;input.value=''}}>{profile.member.qqLinked&&<label>QQ 管理操作<select name="operation"><option value="replace">更换 QQ</option><option value="unlink">解除 QQ 关联</option></select></label>}<label>验证主站密码<input name="qqPassword" type="password" autoComplete="current-password" required maxLength={200}/></label><button disabled={busy}>{profile.member.qqLinked?'执行 QQ 账号操作':'绑定 QQ 并获取头像'}</button></form>:<p>请先设置主站密码并保存恢复密钥，再更换或解除 QQ。</p>}<p className="muted">更换 QQ 要再次完成腾讯授权。绑定冲突会保留原关联；博客账号映射保留，更换或解除后需重新授权。</p></div>}
      <div className="account-card member-auth"><h2>自定义用户名（可选）</h2><form key={profile.member.username} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void mutate('username',{username:form.get('username'),password:form.get('usernamePassword')},'用户名已保存，主站身份与博客关联不变')}}><label>新的用户名<input name="username" defaultValue={profile.member.username} autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+"/></label>{profile.member.passwordReady&&<label>确认主站密码<input name="usernamePassword" type="password" autoComplete="current-password" required maxLength={200}/></label>}<button disabled={busy}>保存用户名</button></form><p className="muted">3—32 位字母、数字或下划线。不修改也可一直使用 QQ 登录；未设置密码时，请在 QQ 验证后五分钟内修改。</p></div>
      <div className="account-card member-auth"><h2>{profile.member.passwordReady?'修改主站密码':'设置主站密码（可选）'}</h2><form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void mutate('password',{oldPassword:form.get('oldPassword'),password:form.get('password')},'密码已保存，其他主站会话已撤销，请保存新恢复密钥');event.currentTarget.reset()}}>{profile.member.passwordReady&&<label>原密码<input type="password" name="oldPassword" required autoComplete="current-password"/></label>}<label>新密码<input type="password" name="password" minLength={12} maxLength={200} required autoComplete="new-password"/></label><button disabled={busy}>保存密码</button></form><p className="muted">无需设置密码即可使用 QQ 登录。若选择设置，请在 QQ 验证后五分钟内操作并保存恢复密钥。博客密码独立管理。</p></div>
      <div className="account-card"><h2>主站登录会话</h2>{sessions.map(item=><div className="account-session" key={item.id}><span>{item.current?'当前会话':'其他会话'} · {new Date(item.createdAt*1000).toLocaleString('zh-CN')}</span><button disabled={busy} onClick={()=>void mutate('sessions/revoke',{id:item.id},'会话已撤销')}>撤销会话</button></div>)}</div>
    </>}
    <p className="account-privacy muted">主站与博客独立管理账号。绑定关系用于授权访问博客业务，密码不在两站之间同步。Studio 管理员登录独立。</p>
  </section>
}
