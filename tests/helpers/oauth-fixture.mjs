// Synthetic OAuth/Bridge HTTP boundary. No production credentials or WordPress data.
import http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
if (process.env.HUB_ACCOUNTS_FIXTURE !== '1') throw new Error('Explicit fixture mode required')
const codes=new Map(), tokens=new Map()
let mode='normal', lifetime=3600, calls=0,releaseToken,releaseRevoke
const users={alice:'11111111-1111-4111-8111-111111111111',bob:'22222222-2222-4222-8222-222222222222'}
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(JSON.stringify(data))}
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:1031')
  if(url.pathname==='/health')return json(res,200,{fixture:true})
  const chunks=[];for await(const part of req)chunks.push(part)
  const body=Buffer.concat(chunks).toString()
  if(url.pathname==='/__fixture/control'){
    const state=body?JSON.parse(body):{}
    if(state.releaseToken){releaseToken?.();releaseToken=undefined;return json(res,200,{released:true})}
    if(state.releaseRevoke){releaseRevoke?.();releaseRevoke=undefined;return json(res,200,{released:true})}
    mode=state.mode??'normal';lifetime=state.lifetime??3600
    if(state.revoke)tokens.clear()
    return json(res,200,{calls,mode})
  }
  if(url.pathname==='/oauth/authorize/'){
    const p=url.searchParams
    if(p.get('client_id')!==process.env.HUB_WORDPRESS_CLIENT_ID||p.get('redirect_uri')!=='http://127.0.0.1:1027/api/auth/callback'||p.get('code_challenge_method')!=='S256')return json(res,400,{error:'invalid_request'})
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
    if(url.pathname.endsWith('/me'))return json(res,200,{hub_uid:mode==='wrong-identity'?users.bob:users[token.user],display_name:mode==='long-name'?'界'.repeat(250):isAlice?'Alice':'Bob',avatar_url:'',as_of,email:'MUST_NOT_LEAK',roles:['administrator']})
    if(url.pathname.endsWith('/points'))return json(res,200,{balance:mode==='invalid-data'?'broken':isAlice?100:200,as_of})
    if(url.pathname.endsWith('/checkin'))return json(res,200,{business_date:new Date().toISOString().slice(0,10),timezone:'Asia/Shanghai',checked_in:isAlice,continuous_days:3,total_days:10,as_of})
    return json(res,200,{items:[{delta:5,balance_after:isAlice?100:200,reason:'合成测试',occurred_at:as_of,private_note:'MUST_NOT_LEAK'}],page:1,per_page:20,total_retained:1,retention_limit:50,as_of})
  }
  json(res,404,{error:'not_found'})
}).listen(1031,'127.0.0.1')
