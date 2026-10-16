import { createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID } from 'node:crypto'
import { existsSync,lstatSync,chmodSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { DATA_DIR,acquireRuntimeLease } from '@/lib/storage'
import { AccountError,assertAccountConfig,type AccountConfig } from './config'
import type { AccountIdentity } from './wordpress'

const now=()=>Math.floor(Date.now()/1000)
export const hashAccountToken=(value:string)=>createHash('sha256').update(value).digest('hex')
const state=globalThis as typeof globalThis & {hubAccountsDb?:Database.Database}
function database(config:AccountConfig){
  try{
    // A request may retain an old config across network awaits. Never sweep newer epochs.
    assertAccountConfig(config)
    if(!state.hubAccountsDb){
      acquireRuntimeLease()
      const file=path.join(DATA_DIR,'accounts.sqlite')
      if(existsSync(file)&&lstatSync(file).isSymbolicLink())throw new Error('Unsafe identity file')
      const db=new Database(file)
      try{
        db.pragma('journal_mode = WAL');db.pragma('busy_timeout = 3000');db.pragma('secure_delete = ON')
        const version=db.pragma('user_version',{simple:true})
        if(version!==0&&version!==1)throw new Error('Unknown identity schema')
        db.exec(`CREATE TABLE IF NOT EXISTS auth_transactions(hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,epoch TEXT NOT NULL,payload TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,id TEXT NOT NULL UNIQUE,hub_uid TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,epoch TEXT NOT NULL,payload TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS sessions_user ON sessions(hub_uid);
          PRAGMA user_version=1;`)
        chmodSync(file,0o600);state.hubAccountsDb=db
      }catch(error){db.close();throw error}
    }
    const db=state.hubAccountsDb
    db.transaction(()=>{
      db.prepare('DELETE FROM auth_transactions WHERE expires_at<=? OR epoch<>?').run(now(),config.epoch)
      db.prepare('DELETE FROM sessions WHERE expires_at<=? OR epoch<>?').run(now(),config.epoch)
    })()
    return db
  }catch(error){if(error instanceof AccountError)throw error;throw new AccountError(503,'account_storage_unavailable','账号数据暂不可用，公开网站和 Studio 不受影响')}
}
function seal(config:AccountConfig,context:string,value:unknown){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',config.key,iv)
  cipher.setAAD(Buffer.from(context))
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()])
  return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url')
}
function open<T>(config:AccountConfig,context:string,value:string):T{
  try{
    if(value.length>20_000)throw new Error('Too large')
    const data=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',config.key,data.subarray(0,12))
    cipher.setAAD(Buffer.from(context));cipher.setAuthTag(data.subarray(12,28))
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')) as T
  }catch{throw new AccountError(503,'account_storage_unavailable','账号凭据暂不可用，请重新登录')}
}
export function beginAuthorization(config:AccountConfig,browser:string,returnTo:string,member?:{memberId:string;sessionHash:string;automatic:boolean;bindingVersion:number}){
  const db=database(config),browserHash=hashAccountToken(browser)
  const count=db.prepare('SELECT COUNT(*) AS n FROM auth_transactions WHERE browser_hash=?').get(browserHash) as {n:number}
  const total=db.prepare('SELECT COUNT(*) AS n FROM auth_transactions').get() as {n:number}
  if(count.n>=16||total.n>=1000)throw new AccountError(429,'authorization_limit','登录请求过多，请稍后再试')
  const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),hash=hashAccountToken(state)
  db.prepare('INSERT INTO auth_transactions VALUES(?,?,?,?,?)').run(hash,browserHash,now()+300,config.epoch,seal(config,'auth:'+hash,{verifier,returnTo,member}))
  return {state,challenge:createHash('sha256').update(verifier).digest('base64url')}
}
export function consumeAuthorization(config:AccountConfig,value:string,browser:string){
  const db=database(config),hash=hashAccountToken(value)
  const row=db.transaction(()=>{
    const row=db.prepare('SELECT payload FROM auth_transactions WHERE hash=? AND browser_hash=? AND expires_at>? AND epoch=?').get(hash,hashAccountToken(browser),now(),config.epoch) as {payload:string}|undefined
    if(row)db.prepare('DELETE FROM auth_transactions WHERE hash=?').run(hash)
    return row
  })()
  if(!row)throw new AccountError(401,'invalid_authorization','授权已失效，请重新登录')
  return open<{verifier:string;returnTo:string;member?:{memberId:string;sessionHash:string;automatic:boolean;bindingVersion:number}}>(config,'auth:'+hash,row.payload)
}
export type AccountSession={hash:string;id:string;hubUid:string;createdAt:number;expiresAt:number;accessToken:string;identity:AccountIdentity}
type Row={hash:string;id:string;hub_uid:string;created_at:number;expires_at:number;payload:string}
function session(config:AccountConfig,row:Row):AccountSession{
  const payload=open<{accessToken:string;identity:AccountIdentity}>(config,'session:'+row.hash+':'+row.hub_uid,row.payload)
  return {hash:row.hash,id:row.id,hubUid:row.hub_uid,createdAt:row.created_at,expiresAt:row.expires_at,...payload}
}
export function createAccountSession(config:AccountConfig,accessToken:string,identity:AccountIdentity,expiresAt:number){
  const db=database(config),token=randomBytes(32).toString('base64url'),hash=hashAccountToken(token),id=randomUUID()
  db.transaction(()=>{
    const total=db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as {n:number}
    if(total.n>=10000)throw new AccountError(429,'session_limit','会话数量过多，请稍后再试')
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)').run(hash,id,identity.hubUid,now(),expiresAt,config.epoch,seal(config,'session:'+hash+':'+identity.hubUid,{accessToken,identity}))
    db.prepare('DELETE FROM sessions WHERE hub_uid=? AND id NOT IN (SELECT id FROM sessions WHERE hub_uid=? ORDER BY created_at DESC,rowid DESC LIMIT 16)').run(identity.hubUid,identity.hubUid)
  })()
  return token
}
export function findAccountSession(config:AccountConfig,token:string){
  if(!/^[-_A-Za-z0-9]{43}$/.test(token))return null
  const row=database(config).prepare('SELECT * FROM sessions WHERE hash=? AND expires_at>? AND epoch=?').get(hashAccountToken(token),now(),config.epoch) as Row|undefined
  return row?session(config,row):null
}
export function listAccountSessions(config:AccountConfig,current:AccountSession){
  return (database(config).prepare('SELECT id,created_at,expires_at FROM sessions WHERE hub_uid=? ORDER BY created_at DESC,rowid DESC').all(current.hubUid) as {id:string;created_at:number;expires_at:number}[]).map(row=>({id:row.id,createdAt:row.created_at,expiresAt:row.expires_at,current:row.id===current.id}))
}
export function deleteAccountSession(config:AccountConfig,current:AccountSession,id=current.id){
  const db=database(config)
  const row=db.transaction(()=>{
    const row=db.prepare('SELECT * FROM sessions WHERE id=? AND hub_uid=?').get(id,current.hubUid) as Row|undefined
    if(row)db.prepare('DELETE FROM sessions WHERE id=? AND hub_uid=?').run(id,current.hubUid)
    return row
  })()
  return row?session(config,row):null
}
