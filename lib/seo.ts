import type { Metadata } from 'next'
import { SITE_BASE } from '@/lib/config'
import { getSiteSettings } from '@/lib/db'

export function pageMetadata(title:string, description:string, path:string, indexable=true, image?:string):Metadata {
  const site=getSiteSettings()
  const url=new URL(path,SITE_BASE).href
  return {
    title,
    description,
    alternates:{canonical:url},
    robots:site.seoIndexable&&indexable?{index:true,follow:true}:{index:false,follow:false},
    openGraph:{title,description,url,type:'website',siteName:site.siteName,locale:'zh_CN',images:[new URL(image || '/og-image', SITE_BASE).href]},
    twitter:{card:'summary_large_image',title,description,images:[new URL(image || '/og-image', SITE_BASE).href]}
  }
}
export function safeJsonLd(value:unknown) {
  return JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')
}
