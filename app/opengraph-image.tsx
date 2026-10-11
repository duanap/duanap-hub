import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
export const runtime = 'nodejs'
export const alt = 'duanap · Little Space'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export default async function ShareImage() {
  const art =
    'data:image/png;base64,' +
    (
      await sharp(readFileSync(path.join(process.cwd(), 'public', 'assets', 'hero-rabbit.webp')))
        .png()
        .toBuffer()
    ).toString('base64')
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#fafaf8',
          position: 'relative',
        }}
      >
        <img
          src={art}
          width="860"
          height="500"
          style={{ position: 'absolute', right: 0, bottom: 0, objectFit: 'cover' }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: 70,
            width: 780,
            background: 'linear-gradient(90deg,#fafaf8 45%,#fafaf8e6 72%,transparent)',
          }}
        >
          <span style={{ fontSize: 28, color: '#3472f6' }}>duanap · Little Space</span>
          <span style={{ fontSize: 64, fontWeight: 800, marginTop: 35, color: '#1d2b45' }}>
            Little things,
          </span>
          <span style={{ fontSize: 64, fontWeight: 800, color: '#3472f6' }}>
            built with curiosity.
          </span>
          <span style={{ fontSize: 22, color: '#6d7a91', marginTop: 40 }}>
            Projects · Games · Tools · duanap.cn
          </span>
        </div>
      </div>
    ),
    size,
  )
}
