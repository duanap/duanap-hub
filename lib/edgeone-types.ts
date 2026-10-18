export type EdgeoneSettings = {title:string;description:string;domains:string[];period:'24h'|'7d'}
export const DEFAULT_EDGEONE_SETTINGS:EdgeoneSettings = {title:'站点加速与防护',description:'EdgeOne 所选域名的汇总统计。',domains:['duanap.cn','www.duanap.cn'],period:'24h'}
export type EdgeoneSnapshot = {
  requests:number|null; bytes:number|null; cacheHits:number|null; cacheEligible:number|null; mitigated:number|null
  start:string; end:string; syncedAt:string; attemptedAt:string; error:string
  status:'unconfigured'|'empty'|'ready'|'stale'|'error'
}
export function edgeoneNumber(value:number|null){return value===null?'暂无数据':new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:2}).format(value)}
export function edgeoneBytes(value:number|null){if(value===null)return '暂无数据';const units=['B','KB','MB','GB','TB'];let i=0;while(value>=1000&&i<units.length-1){value/=1000;i++}return new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value)+' '+units[i]}
export function edgeoneHitRate(data:EdgeoneSnapshot){return data.cacheHits===null||data.cacheEligible===null||!data.cacheEligible?'暂无数据':(100*data.cacheHits/data.cacheEligible).toFixed(1)+'%'}
