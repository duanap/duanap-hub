import { createHash,createHmac,randomBytes,randomUUID,scrypt,timingSafeEqual,createCipheriv,createDecipheriv } from 'node:crypto'
import { chmodSync,existsSync,lstatSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { DATA_DIR,acquireRuntimeLease } from '@/lib/storage'
import { SITE_ORIGIN } from '@/lib/config'
import { isEnabled } from '@/lib/db'
import { AccountError } from './config'
import type { Member } from './member-types'
export type { Member } from './member-types'

export const memberMode=()=>process.env.HUB_LOCAL_ACCOUNTS_ENABLED==='1'
const now=()=>Math.floor(Date.now()/1000)
export const memberHash=(value:string)=>createHash('sha256').update(value).digest('hex')
export type MemberConfig={key:Buffer;epoch:string}
export function memberConfig():MemberConfig {
  if(!memberMode()||process.env.HUB_ACCOUNTS_ENABLED!=='1'||!isEnabled('accounts'))throw new AccountError(404,'accounts_disabled','账号功能未启用')
  const value=process.env.HUB_ACCOUNTS_TOKEN_KEY||'',key=Buffer.from(value,'base64url')
  if(!/^[\w-]{43}$/.test(value)||key.length!==32||key.toString('base64url')!==value)throw new AccountError(503,'member_unconfigured','主站账号服务尚未配置')
  return {key,epoch:memberHash(SITE_ORIGIN+':'+value)}
}
const state=globalThis as typeof globalThis&{hubMembersDb?:Database.Database;hubPasswordJobs?:number}
function database(config:MemberConfig){
  if(memberConfig().epoch!==config.epoch)throw new AccountError(401,'member_configuration_changed','配置已变化，请重新登录')
  if(!state.hubMembersDb){
    acquireRuntimeLease()
    const file=path.join(DATA_DIR,'members.sqlite')
    if(existsSync(file)&&lstatSync(file).isSymbolicLink())throw new AccountError(503,'unsafe_member_storage','账号存储暂不可用')
    const db=new Database(file)
    try{
      db.pragma('journal_mode=WAL');db.pragma('busy_timeout=3000');db.pragma('foreign_keys=ON');db.pragma('secure_delete=ON')
      if(![0,1].includes(Number(db.pragma('user_version',{simple:true}))))throw Error('Unknown member schema')
      db.exec(`CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password TEXT,recovery_hash TEXT,display_name TEXT NOT NULL,avatar_source TEXT NOT NULL DEFAULT 'qq',qq_avatar TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS member_sessions(hash TEXT PRIMARY KEY,id TEXT NOT NULL UNIQUE,member_id TEXT NOT NULL REFERENCES members(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,epoch TEXT NOT NULL,verified_at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS member_sessions_user ON member_sessions(member_id);
        CREATE TABLE IF NOT EXISTS member_qq(app_id TEXT NOT NULL,subject TEXT NOT NULL,member_id TEXT NOT NULL UNIQUE REFERENCES members(id),realm TEXT NOT NULL,union_id TEXT NOT NULL,PRIMARY KEY(app_id,subject));
        CREATE UNIQUE INDEX IF NOT EXISTS member_qq_union ON member_qq(realm,union_id) WHERE realm<>'' AND union_id<>'';
        CREATE TABLE IF NOT EXISTS member_blogs(member_id TEXT PRIMARY KEY REFERENCES members(id),blog_uid TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,linked_at INTEGER NOT NULL,authorized INTEGER NOT NULL DEFAULT 1 CHECK(authorized IN (0,1)));
        CREATE TABLE IF NOT EXISTS member_flows(hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,payload TEXT NOT NULL,expires_at INTEGER NOT NULL,epoch TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS member_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
        PRAGMA user_version=1;`)
      if(!(db.pragma('table_info(member_blogs)') as {name:string}[]).some(column=>column.name==='authorized'))db.exec('ALTER TABLE member_blogs ADD COLUMN authorized INTEGER NOT NULL DEFAULT 1 CHECK(authorized IN (0,1))')
      if(!(db.pragma('table_info(member_sessions)') as {name:string}[]).some(column=>column.name==='verified_at'))db.exec('ALTER TABLE member_sessions ADD COLUMN verified_at INTEGER NOT NULL DEFAULT 0')
      db.exec('UPDATE member_sessions SET verified_at=created_at WHERE verified_at=0')
      if(!(db.pragma('table_info(members)') as {name:string}[]).some(column=>column.name==='binding_version'))db.exec('ALTER TABLE members ADD COLUMN binding_version INTEGER NOT NULL DEFAULT 0')
      if(!(db.pragma('table_info(members)') as {name:string}[]).some(column=>column.name==='qq_version'))db.exec('ALTER TABLE members ADD COLUMN qq_version INTEGER NOT NULL DEFAULT 0')
      chmodSync(file,0o600);state.hubMembersDb=db
    }catch(error){db.close();throw error}
  }
  const db=state.hubMembersDb
  db.prepare('DELETE FROM member_sessions WHERE expires_at<=? OR epoch<>?').run(now(),config.epoch)
  db.prepare('DELETE FROM member_flows WHERE expires_at<=? OR epoch<>?').run(now(),config.epoch)
  db.prepare('DELETE FROM member_attempts WHERE reset_at<=?').run(now())
  return db
}
export function memberSeal(config:MemberConfig,context:string,value:unknown){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',config.key,iv);cipher.setAAD(Buffer.from(context))
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()])
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url')
}
export function memberOpen<T>(config:MemberConfig,context:string,value:string):T{
  try{const data=Buffer.from(value,'base64url');if(data.length<29||data.length>20000)throw Error('Invalid');const cipher=createDecipheriv('aes-256-gcm',config.key,data.subarray(0,12));cipher.setAAD(Buffer.from(context));cipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')) as T}
  catch{throw new AccountError(503,'member_credentials_unavailable','关联凭据不可用，请重新授权博客')}
}
type MemberRow={id:string;username:string;password:string|null;recovery_hash:string|null;display_name:string;avatar_source:'qq'|'initials';qq_avatar:string;created_at:number}
function view(config:MemberConfig,row:MemberRow):Member{return {id:row.id,username:row.username,displayName:row.display_name,avatarUrl:row.avatar_source==='qq'?row.qq_avatar:'',avatarSource:row.avatar_source,passwordReady:!!row.password,qqLinked:!!database(config).prepare('SELECT 1 FROM member_qq WHERE member_id=?').get(row.id)}}
export function memberById(config:MemberConfig,id:string){const row=database(config).prepare('SELECT * FROM members WHERE id=?').get(id) as MemberRow|undefined;return row?view(config,row):null}
export function memberThrottle(config:MemberConfig,bucket:string,limit:number,seconds:number){
  const db=database(config),key=memberHash(bucket)
  db.transaction(()=>{const row=db.prepare('SELECT count FROM member_attempts WHERE key=?').get(key) as {count:number}|undefined;if(row&&row.count>=limit)throw new AccountError(429,'member_rate_limit','尝试次数过多，请稍后重试');db.prepare('INSERT INTO member_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now()+seconds)})()
}
export function validUsername(value:unknown):string{if(typeof value!=='string'||! /^[a-zA-Z0-9_]{3,32}$/.test(value))throw new AccountError(400,'invalid_username','用户名需为 3—32 位字母、数字或下划线');return value.toLowerCase()}
export function validPassword(value:unknown):string{if(typeof value!=='string'||value.length<12||value.length>200)throw new AccountError(400,'invalid_password','密码长度需为 12—200 个字符');return value}
async function derive(password:string,salt:Buffer){
  if((state.hubPasswordJobs||0)>=2)throw new AccountError(429,'member_busy','登录请求较多，请稍后重试')
  state.hubPasswordJobs=(state.hubPasswordJobs||0)+1
  try{return await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)))}finally{state.hubPasswordJobs--}
}
async function passwordHash(password:string){const salt=randomBytes(16);return 'scrypt$'+salt.toString('hex')+'$'+(await derive(password,salt)).toString('hex')}
async function passwordMatches(password:string,stored:string|null){const match=/^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/.exec(stored||'');const result=await derive(password,Buffer.from(match?.[1]||'00'.repeat(16),'hex'));return !!match&&timingSafeEqual(result,Buffer.from(match[2],'hex'))}
export async function registerMember(config:MemberConfig,username:string,password:string){
  const hashed=await passwordHash(password),id=randomUUID(),recovery=randomBytes(32).toString('base64url'),db=database(config)
  if(db.prepare('SELECT 1 FROM members WHERE username=?').get(username))throw new AccountError(409,'username_unavailable','用户名不可用')
  try{return db.transaction(()=>{db.prepare('INSERT INTO members(id,username,password,recovery_hash,display_name,avatar_source,qq_avatar,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,username,hashed,memberHash(recovery),username,'qq','',now());return {member:memberById(config,id)!,recovery,sessionToken:createMemberSession(config,id)}})()}catch(error){if((error as {code?:string}).code==='SQLITE_CONSTRAINT_UNIQUE')throw new AccountError(409,'username_unavailable','用户名不可用');throw error}
}
export async function authenticateMember(config:MemberConfig,username:string,password:string){const db=database(config),row=db.prepare('SELECT * FROM members WHERE username=?').get(username) as MemberRow|undefined;if(!await passwordMatches(password,row?.password||null)||!row)throw new AccountError(401,'invalid_credentials','用户名或密码错误');return db.transaction(()=>{if(!db.prepare('SELECT 1 FROM members WHERE id=? AND password=?').get(row.id,row.password))throw new AccountError(401,'invalid_credentials','密码已变化，请重新登录');return {member:view(config,row),sessionToken:createMemberSession(config,row.id)}})()}
export type MemberSession={hash:string;id:string;memberId:string;createdAt:number;verifiedAt:number;expiresAt:number}
type SessionRow={hash:string;id:string;member_id:string;created_at:number;expires_at:number;verified_at:number}
export function findMemberSession(config:MemberConfig,token:string):MemberSession|null{
  if(!/^[\w-]{43}$/.test(token))return null
  const row=database(config).prepare('SELECT * FROM member_sessions WHERE hash=? AND expires_at>? AND epoch=?').get(memberHash(token),now(),config.epoch) as SessionRow|undefined
  return row?{hash:row.hash,id:row.id,memberId:row.member_id,createdAt:row.created_at,verifiedAt:row.verified_at,expiresAt:row.expires_at}:null
}
export function createMemberSession(config:MemberConfig,id:string){
  const db=database(config),token=randomBytes(32).toString('base64url'),hash=memberHash(token)
  db.transaction(()=>{const count=db.prepare('SELECT COUNT(*) n FROM member_sessions').get() as {n:number};if(count.n>=10000)throw new AccountError(429,'member_session_limit','会话数量过多');const timestamp=now();db.prepare('INSERT INTO member_sessions(hash,id,member_id,created_at,expires_at,epoch,verified_at) VALUES(?,?,?,?,?,?,?)').run(hash,randomUUID(),id,timestamp,timestamp+604800,config.epoch,timestamp);db.prepare('DELETE FROM member_sessions WHERE member_id=? AND hash NOT IN (SELECT hash FROM member_sessions WHERE member_id=? ORDER BY created_at DESC,rowid DESC LIMIT 16)').run(id,id)})()
  return token
}
export function removeMemberSession(config:MemberConfig,current:MemberSession,id=current.id){return database(config).prepare('DELETE FROM member_sessions WHERE member_id=? AND id=?').run(current.memberId,id).changes===1}
export function memberSessions(config:MemberConfig,current:MemberSession){return (database(config).prepare('SELECT id,created_at,expires_at FROM member_sessions WHERE member_id=? ORDER BY created_at DESC').all(current.memberId) as {id:string;created_at:number;expires_at:number}[]).map(row=>({id:row.id,createdAt:row.created_at,expiresAt:row.expires_at,current:row.id===current.id}))}
export function markMemberVerified(config:MemberConfig,current:MemberSession){const changed=database(config).prepare('UPDATE member_sessions SET verified_at=? WHERE hash=? AND member_id=? AND expires_at>? AND epoch=?').run(now(),current.hash,current.memberId,now(),config.epoch);if(changed.changes!==1)throw new AccountError(401,'member_session_changed','主站会话已变化，请重新登录')}
export const memberCsrf=(config:MemberConfig,current:MemberSession)=>createHmac('sha256',config.key).update('member-csrf:'+current.hash).digest('base64url')
export function memberBlog(config:MemberConfig,id:string){const row=database(config).prepare('SELECT * FROM member_blogs WHERE member_id=?').get(id) as {blog_uid:string;payload:string;linked_at:number;authorized:number}|undefined;return row?{blogUid:row.blog_uid,linkedAt:row.linked_at,authorized:row.authorized===1,...(row.authorized===1?memberOpen<{sessionToken:string;match:'authorized'|'qq_union'}>(config,'blog:'+id,row.payload):{sessionToken:'',match:'authorized' as const})}:null}
export function memberBindingVersion(config:MemberConfig,id:string){const row=database(config).prepare('SELECT binding_version n FROM members WHERE id=?').get(id) as {n:number}|undefined;if(!row)throw new AccountError(401,'member_unauthenticated','账号不可用');return row.n}
export function linkMemberBlog(config:MemberConfig,current:MemberSession,blogUid:string,sessionToken:string,match:'authorized'|'qq_union',bindingVersion:number){
  const db=database(config)
  db.transaction(()=>{
    if(!db.prepare('SELECT 1 FROM member_sessions WHERE hash=? AND member_id=? AND expires_at>? AND epoch=?').get(current.hash,current.memberId,now(),config.epoch))throw new AccountError(401,'member_session_changed','主站登录已变化，请重新关联')
    if(memberBindingVersion(config,current.memberId)!==bindingVersion)throw new AccountError(409,'blog_binding_changed','关联操作已被撤销，请重新发起')
    const own=db.prepare('SELECT blog_uid FROM member_blogs WHERE member_id=?').get(current.memberId) as {blog_uid:string}|undefined
    const other=db.prepare('SELECT member_id FROM member_blogs WHERE blog_uid=?').get(blogUid) as {member_id:string}|undefined
    if((own&&own.blog_uid!==blogUid)||(other&&other.member_id!==current.memberId))throw new AccountError(409,'blog_binding_conflict','该账号已有其他关联，请先核实或解除原关联')
    const changed=db.prepare('INSERT INTO member_blogs(member_id,blog_uid,payload,linked_at,authorized) VALUES(?,?,?,?,1) ON CONFLICT(member_id) DO UPDATE SET payload=excluded.payload,authorized=1').run(current.memberId,blogUid,memberSeal(config,'blog:'+current.memberId,{sessionToken,match}),now())
    if(changed.changes!==1)throw new AccountError(503,'blog_binding_unavailable','博客关联暂不可用')
  })()
}
export function unlinkMemberBlog(config:MemberConfig,id:string){const db=database(config);return db.transaction(()=>{const linked=memberBlog(config,id);db.prepare('DELETE FROM member_blogs WHERE member_id=?').run(id);db.prepare('UPDATE members SET binding_version=binding_version+1 WHERE id=?').run(id);return linked})()}
export function updateMemberProfile(config:MemberConfig,id:string,name:string,avatarSource:'qq'|'initials'){if(name.length<1||name.length>80||/[\x00-\x1f\x7f]/.test(name))throw new AccountError(400,'invalid_profile','昵称需为 1—80 个可见字符');database(config).prepare('UPDATE members SET display_name=?,avatar_source=? WHERE id=?').run(name,avatarSource,id)}
export async function recoverMember(config:MemberConfig,username:string,recovery:string,password:string){
  const db=database(config),row=db.prepare('SELECT * FROM members WHERE username=?').get(username) as MemberRow|undefined
  if(!/^[\w-]{43}$/.test(recovery)||!row?.recovery_hash||!timingSafeEqual(Buffer.from(memberHash(recovery)),Buffer.from(row.recovery_hash)))throw new AccountError(401,'invalid_recovery','用户名或恢复密钥无效')
  const hashed=await passwordHash(password),next=randomBytes(32).toString('base64url')
  return db.transaction(()=>{const changed=db.prepare('UPDATE members SET password=?,recovery_hash=? WHERE id=? AND recovery_hash=?').run(hashed,memberHash(next),row.id,row.recovery_hash);if(changed.changes!==1)throw new AccountError(401,'invalid_recovery','恢复密钥已使用');db.prepare('DELETE FROM member_sessions WHERE member_id=?').run(row.id);return {member:memberById(config,row.id)!,recovery:next,sessionToken:createMemberSession(config,row.id)}})()
}
export async function setMemberPassword(config:MemberConfig,current:MemberSession,old:unknown,password:string){
  const db=database(config),row=db.prepare('SELECT * FROM members WHERE id=?').get(current.memberId) as MemberRow
  if(row.password?!await passwordMatches(typeof old==='string'?old:'',row.password):now()-current.verifiedAt>300)throw new AccountError(403,'reauth_required','请验证原密码，或重新使用 QQ 登录后设置')
  const hashed=await passwordHash(password),recovery=randomBytes(32).toString('base64url')
  db.transaction(()=>{if(!db.prepare('SELECT 1 FROM member_sessions WHERE hash=? AND expires_at>?').get(current.hash,now()))throw new AccountError(401,'member_session_changed','登录已失效');const changed=db.prepare('UPDATE members SET password=?,recovery_hash=? WHERE id=? AND password IS ?').run(hashed,memberHash(recovery),row.id,row.password);if(changed.changes!==1)throw new AccountError(409,'password_changed','密码已变化，请重试');db.prepare('DELETE FROM member_sessions WHERE member_id=? AND hash<>?').run(row.id,current.hash)})()
  return recovery
}
export type QQIdentity={appId:string;subject:string;realm:string;unionId:string;displayName:string;avatarUrl:string}
export function memberQQ(config:MemberConfig,id:string){return database(config).prepare('SELECT app_id appId,realm,union_id unionId FROM member_qq WHERE member_id=?').get(id) as {appId:string;realm:string;unionId:string}|undefined}
export function memberQQVersion(config:MemberConfig,id:string){const row=database(config).prepare('SELECT qq_version n FROM members WHERE id=?').get(id) as {n:number}|undefined;if(!row)throw new AccountError(401,'member_unauthenticated','账号不可用');return row.n}
function assertQQPassword(config:MemberConfig,current:MemberSession,proof:string){
  const db=database(config),row=db.prepare('SELECT password,recovery_hash FROM members WHERE id=?').get(current.memberId) as {password:string|null;recovery_hash:string|null}|undefined
  if(!row?.password||!row.recovery_hash)throw new AccountError(403,'password_fallback_required','请先设置主站密码并保存恢复密钥，再管理 QQ 关联')
  if(memberHash(row.password)!==proof)throw new AccountError(403,'password_changed','密码已变化，请重新验证')
  if(!db.prepare('SELECT 1 FROM member_sessions WHERE hash=? AND member_id=? AND expires_at>? AND epoch=?').get(current.hash,current.memberId,now(),config.epoch))throw new AccountError(401,'member_session_changed','主站会话已失效')
}
export async function verifyMemberQQPassword(config:MemberConfig,current:MemberSession,password:unknown){
  const db=database(config),row=db.prepare('SELECT password,recovery_hash FROM members WHERE id=?').get(current.memberId) as {password:string|null;recovery_hash:string|null}|undefined
  if(!row?.password||!row.recovery_hash)throw new AccountError(403,'password_fallback_required','请先设置主站密码并保存恢复密钥，再管理 QQ 关联')
  if(typeof password!=='string'||password.length>200||!await passwordMatches(password,row.password))throw new AccountError(403,'invalid_password','主站密码验证失败')
  const proof=memberHash(row.password);assertQQPassword(config,current,proof);return proof
}
function invalidateQQAccess(config:MemberConfig,current:MemberSession){
  const db=database(config);let blog:ReturnType<typeof memberBlog>=null
  try{blog=memberBlog(config,current.memberId)}catch{/* Still revoke unusable local credentials. */}
  db.prepare("UPDATE member_blogs SET authorized=0,payload='' WHERE member_id=?").run(current.memberId)
  db.prepare('UPDATE members SET qq_version=qq_version+1,binding_version=binding_version+1 WHERE id=?').run(current.memberId)
  db.prepare('DELETE FROM member_sessions WHERE member_id=? AND hash<>?').run(current.memberId,current.hash)
  return blog
}
export async function unlinkMemberQQ(config:MemberConfig,current:MemberSession,password:unknown){
  const revision=memberQQVersion(config,current.memberId),proof=await verifyMemberQQPassword(config,current,password),db=database(config)
  return db.transaction(()=>{assertQQPassword(config,current,proof);if(memberQQVersion(config,current.memberId)!==revision)throw new AccountError(409,'qq_binding_changed','QQ 关联已变化，请刷新重试');if(!db.prepare('DELETE FROM member_qq WHERE member_id=?').run(current.memberId).changes)throw new AccountError(409,'qq_not_linked','当前未关联 QQ');db.prepare("UPDATE members SET qq_avatar='' WHERE id=?").run(current.memberId);return invalidateQQAccess(config,current)})()
}
export type QQChange={qqVersion:number;credentialProof?:string;replace:boolean}
export function resolveMemberQQ(config:MemberConfig,identity:QQIdentity,actor?:MemberSession,change?:QQChange){
  const db=database(config)
  return db.transaction(()=>{
    const known=db.prepare('SELECT member_id FROM member_qq WHERE app_id=? AND subject=?').get(identity.appId,identity.subject) as {member_id:string}|undefined
    const union=identity.realm&&identity.unionId?db.prepare('SELECT member_id FROM member_qq WHERE realm=? AND union_id=?').get(identity.realm,identity.unionId) as {member_id:string}|undefined:undefined
    if(actor&&(!db.prepare('SELECT 1 FROM member_sessions WHERE hash=? AND expires_at>?').get(actor.hash,now())||(known&&known.member_id!==actor.memberId)||(union&&union.member_id!==actor.memberId)))throw new AccountError(409,'qq_binding_conflict','QQ 已关联其他主站账号，或主站会话已变化')
    const id=actor?.memberId||known?.member_id||union?.member_id||randomUUID()
    const prior=db.prepare('SELECT app_id,subject FROM member_qq WHERE member_id=?').get(id) as {app_id:string;subject:string}|undefined
    if(actor){
      if(!change||memberQQVersion(config,id)!==change.qqVersion)throw new AccountError(409,'qq_binding_changed','QQ 关联已变化，请重新发起')
      if(change.replace||!prior||change.credentialProof)assertQQPassword(config,actor,change.credentialProof||'')
      if(change.replace&&!prior)throw new AccountError(409,'qq_not_linked','当前未关联 QQ')
    }
    if(prior&&(prior.app_id!==identity.appId||prior.subject!==identity.subject)&&!change?.replace)throw new AccountError(409,'qq_binding_conflict','当前已有其他 QQ，请使用更换 QQ 功能')
    if(actor&&change?.replace)db.prepare('DELETE FROM member_qq WHERE member_id=?').run(id)
    if(!db.prepare('SELECT 1 FROM members WHERE id=?').get(id))db.prepare('INSERT INTO members(id,username,password,recovery_hash,display_name,avatar_source,qq_avatar,created_at) VALUES(?,?,NULL,NULL,?,?,?,?)').run(id,'qq_'+randomBytes(10).toString('hex'),identity.displayName||'QQ 用户','qq',identity.avatarUrl,now())
    db.prepare("INSERT INTO member_qq VALUES(?,?,?,?,?) ON CONFLICT(app_id,subject) DO UPDATE SET realm=excluded.realm,union_id=CASE WHEN excluded.realm<>'' AND excluded.union_id='' AND member_qq.realm=excluded.realm THEN member_qq.union_id ELSE excluded.union_id END").run(identity.appId,identity.subject,id,identity.realm,identity.unionId)
    db.prepare('UPDATE members SET qq_avatar=? WHERE id=?').run(identity.avatarUrl,id)
    if(actor&&change?.replace)invalidateQQAccess(config,actor)
    else if(actor&&!prior)db.prepare('UPDATE members SET qq_version=qq_version+1 WHERE id=?').run(id)
    return memberById(config,id)!
  })()
}
export function beginMemberFlow(config:MemberConfig,browser:string,payload:unknown){
  const db=database(config),n=db.prepare('SELECT COUNT(*) n FROM member_flows').get() as {n:number}
  if(n.n>=1000)throw new AccountError(429,'authorization_limit','授权请求过多')
  const state=randomBytes(32).toString('base64url'),hash=memberHash(state)
  db.prepare('INSERT INTO member_flows VALUES(?,?,?,?,?)').run(hash,memberHash(browser),memberSeal(config,'flow:'+hash,payload),now()+300,config.epoch)
  return state
}
export function consumeMemberFlow<T>(config:MemberConfig,state:string,browser:string){const db=database(config),hash=memberHash(state);return db.transaction(()=>{const row=db.prepare('SELECT payload FROM member_flows WHERE hash=? AND browser_hash=? AND expires_at>? AND epoch=?').get(hash,memberHash(browser),now(),config.epoch) as {payload:string}|undefined;if(!row)throw new AccountError(401,'invalid_authorization','授权已失效，请重新登录');db.prepare('DELETE FROM member_flows WHERE hash=?').run(hash);return memberOpen<T>(config,'flow:'+hash,row.payload)})()}
