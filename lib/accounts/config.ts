import { createHash } from 'node:crypto'
import { getDatabase, isEnabled } from '@/lib/db'
import { SITE_ORIGIN } from '@/lib/config'

export class AccountError extends Error {
  constructor(public status:number,public code:string,message:string){super(message)}
}
export type AccountConfig={base:URL;clientId:string;clientSecret:string;key:Buffer;callback:string;epoch:string}
export function accountConfig():AccountConfig {
  if(process.env.HUB_ACCOUNTS_ENABLED!=='1'||!isEnabled('accounts'))throw new AccountError(404,'accounts_disabled','账号功能未启用')
  const fail=()=>new AccountError(503,'accounts_unconfigured','账号服务尚未配置，请稍后再试')
  try{
    const base=new URL(process.env.HUB_WORDPRESS_URL||'')
    const local=process.env.HUB_ACCOUNTS_ALLOW_LOOPBACK==='1'&&new URL(SITE_ORIGIN).hostname==='127.0.0.1'&&base.hostname==='127.0.0.1'
    if((base.protocol!=='https:'&&!local)||(base.protocol!=='https:'&&base.protocol!=='http:')||base.username||base.password||base.search||base.hash||(!SITE_ORIGIN.startsWith('https://')&&!local))throw fail()
    base.pathname=base.pathname.replace(/\/*$/,'/')
    const clientId=process.env.HUB_WORDPRESS_CLIENT_ID||'',clientSecret=process.env.HUB_WORDPRESS_CLIENT_SECRET||'',keyText=process.env.HUB_ACCOUNTS_TOKEN_KEY||''
    const key=Buffer.from(keyText,'base64url')
    if(!/^[A-Za-z0-9_-]{1,191}$/.test(clientId)||clientSecret.length<20||clientSecret.length>512||!/^[-_A-Za-z0-9]{43}$/.test(keyText)||key.length!==32||key.toString('base64url')!==keyText)throw fail()
    const row=getDatabase().prepare("SELECT updated_at FROM module_settings WHERE id='accounts'").get() as {updated_at:string}|undefined
    const epoch=createHash('sha256').update(JSON.stringify([SITE_ORIGIN,base.href,clientId,clientSecret,keyText,row?.updated_at||'initial'])).digest('hex')
    return {base,clientId,clientSecret,key,callback:SITE_ORIGIN+'/api/auth/callback',epoch}
  }catch(error){if(error instanceof AccountError)throw error;throw fail()}
}
export function accountReturnTo(value:string|null){
  if(value===null)return '/account'
  if(value.length>512||!/^\/account(?:\/[A-Za-z0-9/_-]*)?(?:\?[A-Za-z0-9._~%=&+-]*)?$/.test(value))throw new AccountError(400,'invalid_return','返回地址无效')
  return value
}
export function assertAccountConfig(config:AccountConfig){
  if(accountConfig().epoch!==config.epoch)throw new AccountError(401,'account_configuration_changed','账号配置已变化，请重新登录')
}
