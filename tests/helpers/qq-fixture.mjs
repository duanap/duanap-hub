import http from 'node:http'
import { randomBytes,createHash } from 'node:crypto'
if(process.env.HUB_ACCOUNTS_FIXTURE!=='1')throw Error('Explicit fixture required')
let mode='normal',user='alice',avatar='large'
const codes=new Map(),tokens=new Map(),subject=user=>user==='alice'?'A'.repeat(32):user==='bob'?'B'.repeat(32):createHash('sha256').update(user).digest('hex').slice(0,32)
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:1032'),p=url.searchParams,json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
 if(url.pathname==='/health')return json({fixture:true})
 if(url.pathname==='/__fixture/control'){const parts=[];for await(const part of req)parts.push(part);const data=JSON.parse(Buffer.concat(parts).toString()||'{}');mode=data.mode||'normal';user=data.user||'alice';avatar=data.avatar||'large';return json({ok:true})}
 if(url.pathname==='/oauth2.0/authorize'){if(p.get('client_id')!=='900000001'||p.get('redirect_uri')!=='http://127.0.0.1:1027/oauth/qq/callback')return json({error:'invalid_request'},400);const code=randomBytes(24).toString('hex');codes.set(code,{user,mode,avatar});const target=new URL(p.get('redirect_uri'));target.searchParams.set('code',code);target.searchParams.set('state',p.get('state'));res.writeHead(302,{Location:target.href});return res.end()}
 if(url.pathname==='/oauth2.0/token'){if(p.get('client_id')!=='900000001'||p.get('client_secret')!=='synthetic-qq-private-key-not-production')return json({error:'invalid_client'},401);const entry=codes.get(p.get('code'));codes.delete(p.get('code'));if(!entry)return json({error:'invalid_grant'},400);const token=randomBytes(24).toString('hex');tokens.set(token,entry);return json({access_token:token,expires_in:3600})}
 const entry=tokens.get(p.get('access_token'));if(!entry)return json({error:100016},401)
 if(url.pathname==='/oauth2.0/me'){if(entry.mode==='no-union'&&p.get('unionid'))return json({error:100048});return json({client_id:entry.mode==='wrong-app'?'900000002':'900000001',openid:subject(entry.user),...(p.get('unionid')?{unionid:'fixture-union-'+subject(entry.user)}:{})})}
 if(url.pathname==='/user/get_user_info')return json({ret:0,nickname:'QQ '+entry.user,figureurl_qq_2:entry.avatar==='small'?'':entry.avatar==='unsafe'?'https://evil.invalid/avatar':'https://q.qlogo.cn/qqapp/900000001/'+subject(entry.user)+'/100',figureurl_qq_1:'http://q.qlogo.cn/qqapp/900000001/'+subject(entry.user)+'/40'})
 json({error:'not_found'},404)
}).listen(1032,'127.0.0.1')
