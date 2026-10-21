import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicShell } from '@/components/PublicShell'
import { AlbumGallery } from '@/components/public/ContentViews'
import { isEnabled } from '@/lib/db'
import { getPublicAlbums } from '@/lib/public-content'
import { pageMetadata } from '@/lib/seo'

export function generateMetadata(): Metadata {
  return pageMetadata('影像相册', '独立管理的生活相册与照片。', '/photos', isEnabled('photos') && getPublicAlbums().length > 0)
}
export default function PhotosPage() {
  if (!isEnabled('photos')) notFound()
  const albums = getPublicAlbums()
  return <PublicShell><header className="hub-page-heading hub-photos-heading"><h1>Photos</h1><p>{albums.length ? `${albums.length} 个相册 · ${albums.reduce((count, album) => count + album.images.length, 0)} 张照片` : '收藏生活里的光与影。'}</p></header>
    {albums.length ? <AlbumGallery albums={albums} /> : <div className="hub-empty"><h2>相册还没有照片</h2><p>留一点空间，给下一次想记录的瞬间。</p></div>}
  </PublicShell>
}
