import { NextResponse } from 'next/server'
import { guardAdminMutation } from '@/lib/admin-auth'
import { MAX_AUDIO_BYTES, uploadAudio } from '@/lib/media'
import { readLimitedBody } from '@/lib/request-body'
import { apiError } from '@/lib/api'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  const denied = await guardAdminMutation(request); if (denied) return denied
  try {
    const body = await readLimitedBody(request, MAX_AUDIO_BYTES + 64 * 1024)
    const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new Error('请选择音频文件')
    return NextResponse.json({ media: await uploadAudio(file) }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (cause) { return apiError(cause) }
}
