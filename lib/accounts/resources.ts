import { NextResponse } from 'next/server'
import { AccountError,accountConfig,assertAccountConfig } from './config'
import { currentAccount,csrfToken,privateHeaders,accountFailure } from './session'
import { deleteAccountSession } from './store'
import { readIdentity,readPoints,readCheckin,readHistory,readBindings } from './wordpress'

export async function accountResource(request:Request,kind:'me'|'points'|'checkin'|'history'|'bindings'){
  try{
    const config=accountConfig(),current=await currentAccount(config),url=new URL(request.url)
    for(const key of ['uid','hub_uid','user_id','access_token','token'])if(url.searchParams.has(key))throw new AccountError(400,'identity_override','不能指定他人的账号或令牌')
    try{
      const identity=await readIdentity(config,current.accessToken)
      if(identity.hubUid!==current.hubUid)throw new AccountError(401,'identity_changed','账号授权已变化，请重新登录')
      let data:unknown
      if(kind==='me')data={user:identity,csrfToken:csrfToken(config,current),expiresAt:current.expiresAt,blogUrl:config.base.href}
      else if(kind==='points')data=await readPoints(config,current.accessToken)
      else if(kind==='checkin')data=await readCheckin(config,current.accessToken)
      else if(kind==='bindings'){
        const binding=await readBindings(config,current.accessToken),target=new URL(binding.managementUrl)
        target.searchParams.set('expect_uid',current.hubUid);data={...binding,managementUrl:target.href}
      }
      else{
        const page=url.searchParams.get('page')||'1',size=url.searchParams.get('per_page')||'20'
        if(url.searchParams.getAll('page').length>1||url.searchParams.getAll('per_page').length>1||!/^\d{1,2}$/.test(page)||Number(page)<1||Number(page)>50||!/^\d{1,2}$/.test(size)||Number(size)<1||Number(size)>20)throw new AccountError(400,'invalid_page','分页参数无效')
        data=await readHistory(config,current.accessToken,page,size)
      }
      assertAccountConfig(config)
      return NextResponse.json(kind==='me'?data:{...(data as Record<string,unknown>),hubUid:current.hubUid},{headers:privateHeaders})
    }catch(error){
      if(error instanceof AccountError&&(error.status===401||error.status===403))deleteAccountSession(config,current)
      throw error
    }
  }catch(error){return accountFailure(error)}
}
