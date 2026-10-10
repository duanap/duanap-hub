import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { ProjectCard } from '@/components/ProjectCard'
import { isEnabled, listProjects } from '@/lib/db'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata():Metadata{return pageMetadata('游戏中心','查看 duanap 开发的小游戏、玩法规则、版本与更新。','/games',isEnabled('games')&&isEnabled('projects'))}
export default function GamesPage(){
  if(!isEnabled('games')||!isEnabled('projects'))notFound()
  const items=listProjects({publishedOnly:true,category:'game'})
  return <PublicShell><div className="page-heading"><span className="eyebrow">GAME CENTER</span><h1>游戏中心</h1><p>玩法介绍、版本动态与在线入口。个人战绩和用户功能将在后续阶段接入。</p></div>
    {items.length?<div className="project-grid">{items.map(p=><ProjectCard key={p.id} project={p}/>)}</div>:<div className="soft-placeholder">暂无公开游戏，游戏介绍可在后台通过项目分类发布。</div>}
  </PublicShell>
}
