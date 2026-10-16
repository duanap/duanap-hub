'use client'
import { useEffect,useState } from 'react'
import { contentPosts,type ContentSettings,type ContentSnapshot } from '@/lib/content-types'
export function BlogWidget({settings,initial}:{settings:ContentSettings;initial:ContentSnapshot}){
  const [data,setData]=useState(initial),[loading,setLoading]=useState(false),[hidden,setHidden]=useState(false)
  useEffect(()=>{
    const controller=new AbortController();setLoading(true)
    void fetch('/api/content',{cache:'no-store',signal:controller.signal}).then(async response=>{
      if(response.status===404){setHidden(true);return}
      if(!response.ok)throw Error('Unavailable')
      const value=await response.json();if(!controller.signal.aborted)setData(value.snapshot)
    }).catch(()=>{if(!controller.signal.aborted)setData(previous=>({...previous,error:'博客动态暂不可用，保留已显示的摘要',status:previous.syncedAt?'stale':'error'}))}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[])
  if(hidden)return null
  const posts=contentPosts(data,settings)
  return <section className="home-section" data-module="content">
    <div className="section-title"><div><span className="eyebrow">FROM THE BLOG</span><h2>{settings.title}</h2></div>{data.source&&<a className="subtle-link" href={data.source} rel="noreferrer">前往博客 ↗</a>}</div>
    <p className="blog-description">{settings.description}</p>
    <p className="blog-sync-status" role="status">{data.status==='unconfigured'?'博客数据源尚未配置':data.syncedAt?'最近成功同步：'+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.syncedAt))+'（北京时间）':loading?'正在同步博客公开摘要…':'尚未同步公开摘要'}{data.status==='stale'?' · 缓存已过期':''}{loading&&data.syncedAt?' · 正在检查更新':''}{data.error?' · '+data.error:''}</p>
    {posts.length?<div className={'blog-grid blog-size-'+settings.size}>{posts.map(post=><article key={post.id} className="blog-card">
      <a href={post.url} className="blog-post-link" rel="noreferrer">{post.coverUrl&&<img key={post.coverUrl} src={post.coverUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none'}}/>}<div className="blog-card-body"><time dateTime={post.publishedAt}>{post.publishedAt.slice(0,10)}</time><h3>{post.title}</h3><p>{post.summary}</p><span className="subtle-link">阅读原文 ↗</span></div></a>
      <div className="blog-categories">{post.categoryIds.map(id=>data.categories.find(c=>c.id===id)).filter(Boolean).map(category=><a key={category!.id} href={category!.url} rel="noreferrer">{category!.name}</a>)}</div>
    </article>)}</div>:<div className="soft-placeholder">{data.syncedAt?'当前筛选下暂无公开文章。':'博客摘要将在成功同步后显示。'}</div>}
  </section>
}
