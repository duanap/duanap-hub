import { redirect } from 'next/navigation'
import { hasAdminSession } from '@/lib/admin-auth'
import { getSiteSettings, getModules, listProjects, getProjectEntries } from '@/lib/db'
import { Studio } from '@/components/Studio'
import { contentSnapshot,getContentSettings } from '@/lib/content'
import {getToolSettings} from '@/lib/tool-settings'
import {getGithubSettings,githubSnapshot} from '@/lib/github'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export const metadata={title:'duanap Studio',robots:{index:false,follow:false}}
export default async function StudioPage(){
  if(!await hasAdminSession())redirect('/duanap/login')
  const projects=listProjects()
  return <Studio initialSettings={getSiteSettings()} initialModules={getModules()} initialProjects={projects} initialEntries={projects.flatMap(p=>getProjectEntries(p.id))} initialContentSettings={getContentSettings()} initialContentSnapshot={contentSnapshot()} initialTools={getToolSettings()} initialGithubSettings={getGithubSettings()} initialGithubSnapshot={githubSnapshot()}/>
}
