import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { AlbumGallery } from '@/components/public/ContentViews'
import { isEnabled } from '@/lib/db'
import { getPublicAlbums } from '@/lib/public-content'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  return pageMetadata('影像相册', '生活影像、个人相册与项目截图。', '/photos', isEnabled('photos') && getPublicAlbums().length > 0)
}
export default function PhotosPage() {
  if (!isEnabled('photos')) notFound()
  const albums = getPublicAlbums()
  return <PublicShell><header className="hub-page-heading hub-photos-heading"><h1>Photos</h1><p>{albums.length ? `${albums.length} 个公开相册 · ${albums.reduce((count, album) => count + album.images.length, 0)} 张图片` : '生活影像与项目里的小片段。'}</p></header>
    {albums.length ? <AlbumGallery albums={albums} /> : <div className="hub-empty"><h2>相册还没有图片</h2><p>公开相册和已发布项目的图片会展示在这里。</p></div>}
  </PublicShell>
}
