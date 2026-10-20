// Synthetic OAuth/Bridge HTTP boundary. No production credentials or WordPress data.
import http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
if (process.env.HUB_ACCOUNTS_FIXTURE !== '1') throw new Error('Explicit fixture mode required')
const codes=new Map(), tokens=new Map()
let mode='normal', lifetime=3600, calls=0,releaseToken,releaseRevoke,qqUnion=false
const checkins=new Map();let writeCalls=0
const businessDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const users={alice:'11111111-1111-4111-8111-111111111111',bob:'22222222-2222-4222-8222-222222222222'}
const fixtureOrigin=process.env.HUB_FIXTURE_CALLBACK_ORIGIN||'http://127.0.0.1:1027',fixturePort=Number(process.env.HUB_FIXTURE_PORT||1031)
if(new URL(fixtureOrigin).hostname!=='127.0.0.1'||!Number.isInteger(fixturePort)||fixturePort<1024||fixturePort>65535)throw new Error('Loopback fixture configuration required')
const providerOrigin='http://127.0.0.1:'+fixturePort
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(JSON.stringify(data))}
http.createServer(async(req,res)=>{
  const url=new URL(req.url,providerOrigin)
  if(url.pathname==='/health')return json(res,200,{fixture:true})
  const chunks=[];for await(const part of req)chunks.push(part)
  const body=Buffer.concat(chunks).toString()
  if(url.pathname==='/__fixture/control'){
    const state=body?JSON.parse(body):{}
    if(state.releaseToken){releaseToken?.();releaseToken=undefined;return json(res,200,{released:true})}
    if(state.releaseRevoke){releaseRevoke?.();releaseRevoke=undefined;return json(res,200,{released:true})}
    mode=state.mode??'normal';lifetime=state.lifetime??3600
    qqUnion=state.qqUnion===true
    if(state.revoke)tokens.clear()
    if(state.resetCheckins){checkins.clear();writeCalls=0}
    if(state.seedCheckin){checkins.set(state.seedCheckin+':'+businessDate(),{status:'success',receipt:'33333333-3333-4333-8333-333333333333',business_date:businessDate(),timezone:'Asia/Shanghai',checked_in:true,continuous_days:4,total_days:11,balance:205,points_awarded:5,integral_awarded:2,as_of:new Date().toISOString()})}
    return json(res,200,{calls,mode,writeCalls})
  }
  if(url.pathname==='/oauth/authorize/'){
    const p=url.searchParams
    if(p.get('client_id')!==process.env.HUB_WORDPRESS_CLIENT_ID||p.get('redirect_uri')!==fixtureOrigin+'/api/auth/callback'||p.get('code_challenge_method')!=='S256')return json(res,400,{error:'invalid_request'})
    const code=randomBytes(24).toString('base64url'),user=p.get('fixtureUser')==='bob'?'bob':'alice'
    codes.set(code,{challenge:p.get('code_challenge'),redirect:p.get('redirect_uri'),user})
    const target=new URL(p.get('redirect_uri'));target.searchParams.set('code',code);target.searchParams.set('state',p.get('state'))
    res.writeHead(302,{Location:target.href});return res.end()
  }
  const p=new URLSearchParams(body)
  if(url.pathname==='/oauth/token/'){
    calls++
    if(mode==='hold-token'){mode='normal';await new Promise(resolve=>{releaseToken=resolve})}
    if(p.get('client_id')!==process.env.HUB_WORDPRESS_CLIENT_ID||p.get('client_secret')!==process.env.HUB_WORDPRESS_CLIENT_SECRET)return json(res,401,{error:'invalid_client'})
    const code=codes.get(p.get('code'))
    if(!code||p.get('grant_type')!=='authorization_code'||p.get('redirect_uri')!==code.redirect||createHash('sha256').update(p.get('code_verifier')||'').digest('base64url')!==code.challenge)return json(res,400,{error:'invalid_grant'})
    codes.delete(p.get('code'))
    const token=randomBytes(32).toString('base64url');tokens.set(token,{user:code.user,expires:Date.now()+lifetime*1000})
    return json(res,200,{access_token:token,token_type:'Bearer',expires_in:lifetime,scope:'basic'})
  }
  if(url.pathname==='/oauth/revoke/'){
    if(mode==='hold-revoke'){mode='normal';await new Promise(resolve=>{releaseRevoke=resolve})}
    if(mode==='unavailable')return json(res,503,{error:'temporarily_unavailable'})
    tokens.delete(p.get('token'));return json(res,200,{})
  }
  if(url.pathname.startsWith('/wp-json/duanap-hub/v1/')){
    calls++
    if(mode==='timeout'){setTimeout(()=>json(res,503,{}),6000);return}
    if(mode==='unavailable')return json(res,503,{error:'unavailable'})
    const token=tokens.get((req.headers.authorization||'').replace(/^Bearer /,''))
    if(!token||token.expires<=Date.now())return json(res,401,{error:'invalid_token'})
    const as_of=new Date().toISOString(),isAlice=token.user==='alice'
    const dailyKey=token.user+':'+businessDate(),daily=checkins.get(dailyKey)
    if(url.pathname.endsWith('/checkin/result'))return json(res,200,daily?{...daily,status:'already'}:{status:mode==='checkin-processing'?'processing':'not_recorded',business_date:url.searchParams.get('business_date'),timezone:'Asia/Shanghai',as_of})
    if(url.pathname.endsWith('/checkin')&&req.method==='POST'){
      writeCalls++
      const input=JSON.parse(body)
      if(input.business_date!==businessDate())return json(res,409,{error:'date_changed'})
      if(mode==='checkin-processing')return json(res,200,{status:'processing',business_date:businessDate(),timezone:'Asia/Shanghai',as_of})
      const result=daily?{...daily,status:'already'}:{status:'success',receipt:'33333333-3333-4333-8333-333333333333',business_date:businessDate(),timezone:'Asia/Shanghai',checked_in:true,continuous_days:4,total_days:11,balance:isAlice?105:205,points_awarded:5,integral_awarded:2,as_of,private_note:'MUST_NOT_LEAK'}
      checkins.set(dailyKey,result)
      if(mode==='checkin-lost-response'){setTimeout(()=>json(res,200,result),6000);return}
      return json(res,200,mode==='checkin-invalid'?{...result,balance:'broken'}:mode==='checkin-invalid-receipt'?{...result,receipt:'-'.repeat(36)}:result)
    }
    if(url.pathname.endsWith('/bindings'))return json(res,200,{providers:[{provider:'qq',name:'QQ',configured:true,linked:isAlice,legacy_review:false,subject:'MUST_NOT_LEAK'},{provider:'github',name:'GitHub',configured:true,linked:!isAlice,legacy_review:false},{provider:'gitee',name:'Gitee',configured:false,linked:false,legacy_review:false}],password_ready:false,management_url:mode==='wrong-binding-origin'?'https://evil.invalid/manage':providerOrigin+'/hub-account-bindings',recovery_url:providerOrigin+'/wp-login.php?action=lostpassword',as_of})
    if(url.pathname.endsWith('/me'))return json(res,200,{hub_uid:mode==='wrong-identity'?users.bob:users[token.user],display_name:mode==='long-name'?'界'.repeat(250):isAlice?'Alice':'Bob',avatar_url:'',as_of,email:'MUST_NOT_LEAK',roles:['administrator'],...(qqUnion?{qq_union:{realm:'fixture-developer',union_id:'fixture-union-'+(isAlice?'A':'B').repeat(32)}}:{})})
    if(url.pathname.endsWith('/points'))return json(res,200,{balance:mode==='invalid-data'?'broken':daily?.balance??(isAlice?100:200),as_of})
    if(url.pathname.endsWith('/checkin'))return json(res,200,{business_date:businessDate(),timezone:'Asia/Shanghai',checked_in:!!daily||isAlice,continuous_days:daily?4:3,total_days:daily?11:10,as_of})
    return json(res,200,{items:[{delta:5,balance_after:isAlice?100:200,reason:'合成测试',occurred_at:as_of,private_note:'MUST_NOT_LEAK'}],page:1,per_page:20,total_retained:1,retention_limit:50,as_of})
  }
  json(res,404,{error:'not_found'})
}).listen(fixturePort,'127.0.0.1')
