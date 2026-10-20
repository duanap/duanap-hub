export type BlogCategory={id:number;name:string;url:string}
export type BlogPost={id:number;title:string;summary:string;url:string;publishedAt:string;coverUrl:string;categoryIds:number[];tags?:string[]}
export type ContentSettings={title:string;description:string;limit:number;size:'small'|'medium'|'large';order:'newest'|'oldest';categoryIds:number[];featuredIds:number[]}
export const DEFAULT_CONTENT_SETTINGS:ContentSettings={title:'博客动态',description:'最近的记录与分享，点击前往博客阅读原文。',limit:6,size:'medium',order:'newest',categoryIds:[],featuredIds:[]}
export type ContentSnapshot={source:string;posts:BlogPost[];categories:BlogCategory[];syncedAt:string;attemptedAt:string;error:string;truncated?:boolean;status:'unconfigured'|'empty'|'ready'|'stale'|'error'}
export function contentPosts(snapshot:ContentSnapshot,settings:ContentSettings,limit=settings.limit){
  return snapshot.posts.filter(p=>!settings.categoryIds.length||p.categoryIds.some(id=>settings.categoryIds.includes(id))).sort((a,b)=>{
    const first=settings.featuredIds.indexOf(a.id),second=settings.featuredIds.indexOf(b.id)
    if(first>=0||second>=0)return (first<0?Infinity:first)-(second<0?Infinity:second)
    return (settings.order==='newest'?-1:1)*a.publishedAt.localeCompare(b.publishedAt)||a.id-b.id
  }).slice(0,limit)
}
