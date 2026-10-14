import { NextResponse } from 'next/server'
import { readLimitedBody } from '@/lib/request-body'
import { AccountError,accountConfig,assertAccountConfig } from './config'
import { currentAccount,guardAccountMutation,privateHeaders,accountFailure } from './session'
import { readIdentity,writeCheckin,readCheckinResult,validBusinessDate } from './wordpress'
import { deleteAccountSession } from './store'

export async function accountCheckin(request:Request,write:boolean){
  try{
    const config=accountConfig(),current=await currentAccount(config)
    if(write)guardAccountMutation(request,config,current)
    if(write&&new URL(request.url).searchParams.size)throw new AccountError(400,'invalid_checkin_query','签到请求不能指定账号或查询参数')
    if(write&&process.env.HUB_CHECKIN_ENABLED!=='1')throw new AccountError(503,'checkin_disabled','主站签到尚未启用，请使用博客入口')
    let businessDate:unknown
    if(write){
      try{
        if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('JSON required')
        const body:unknown=JSON.parse((await readLimitedBody(request,2048)).toString('utf8'))
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>k!=='businessDate'))throw new Error('Invalid body')
        businessDate=(body as {businessDate?:unknown}).businessDate
      }catch{throw new AccountError(400,'invalid_checkin_body','签到参数无效')}
    }else{
      const params=new URL(request.url).searchParams
      if([...params.keys()].some(k=>k!=='businessDate')||params.getAll('businessDate').length!==1)throw new AccountError(400,'invalid_checkin_date','查询日期无效')
      businessDate=params.get('businessDate')
    }
    if(!validBusinessDate(businessDate))throw new AccountError(400,'invalid_checkin_date','签到日期无效')
    try{
      const identity=await readIdentity(config,current.accessToken)
      if(identity.hubUid!==current.hubUid)throw new AccountError(401,'identity_changed','账号授权已变化，请重新登录')
      assertAccountConfig(config)
      let result
      try{result=write?await writeCheckin(config,current.accessToken,businessDate):await readCheckinResult(config,current.accessToken,businessDate)}
      catch(error){if(write&&(!(error instanceof AccountError)||error.status===503))throw new AccountError(503,'checkin_unknown','签到结果尚未确认，请先查询结果');throw error}
      assertAccountConfig(config)
      return NextResponse.json({...result,hubUid:current.hubUid},{headers:privateHeaders})
    }catch(error){
      if(error instanceof AccountError&&(error.status===401||error.status===403))deleteAccountSession(config,current)
      throw error
    }
  }catch(error){return accountFailure(error)}
}
