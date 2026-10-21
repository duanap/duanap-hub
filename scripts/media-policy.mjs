export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const types = { webp: 'image/webp', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac' }
export const mediaName = name => typeof name === 'string' && /^[a-f0-9-]{36}\.(webp|mp3|m4a|ogg|wav|flac)$/.test(name)
export const mediaMime = name => types[name.split('.').pop()] || ''
export const mediaLimit = name => name.endsWith('.webp') ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES

// Identify supported audio containers without trusting the filename or client MIME.
export function audioExtension(data) {
  if (!Buffer.isBuffer(data) || data.length < 16 || data.length > MAX_AUDIO_BYTES) throw Error('音频大小或格式无效')
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE') {
    if (data.readUInt32LE(4) + 8 > data.length) throw Error('WAV 文件不完整')
    let fmt = false, samples = false, position = 12, chunks = 0
    while (position + 8 <= data.length && chunks++ < 4096) {
      const kind = data.toString('ascii', position, position + 4), size = data.readUInt32LE(position + 4), start = position + 8
      if (start + size > data.length) throw Error('WAV 数据块不完整')
      if (kind === 'fmt ' && size >= 16) fmt = [1, 3, 65534].includes(data.readUInt16LE(start)) && data.readUInt16LE(start + 2) > 0 && data.readUInt16LE(start + 2) <= 8 && data.readUInt32LE(start + 4) > 0
      if (kind === 'data' && size > 0) samples = true
      position = start + size + (size % 2)
    }
    if (fmt && samples) return 'wav'
    throw Error('WAV 文件缺少有效音频')
  }
  if (data.toString('ascii', 0, 4) === 'fLaC' && (data[4] & 127) === 0 && data.readUIntBE(5, 3) === 34 && data.length > 42) return 'flac'
  if (data.toString('ascii', 0, 4) === 'OggS' && data[4] === 0 && data[26] > 0) {
    const start = 27 + data[26]
    if (data.toString('ascii', start, start + 8) === 'OpusHead' || data.toString('ascii', start, start + 7) === '\x01vorbis') return 'ogg'
  }
  if (data.toString('ascii', 4, 8) === 'ftyp' && data.readUInt32BE(0) >= 16 && data.readUInt32BE(0) <= data.length && ['M4A ', 'M4B ', 'isom', 'iso2', 'mp41', 'mp42'].includes(data.toString('ascii', 8, 12))) return 'm4a'
  let start = 0
  if (data.toString('ascii', 0, 3) === 'ID3') {
    if (data.subarray(6, 10).some(byte => byte & 128)) throw Error('MP3 标签无效')
    start = 10 + ((data[6] << 21) | (data[7] << 14) | (data[8] << 7) | data[9]) + ((data[5] & 16) ? 10 : 0)
  }
  for (let i = start; i + 4 < Math.min(data.length, start + 65536); i++) {
    if (data[i] === 255 && (data[i + 1] & 224) === 224 && (data[i + 1] & 24) !== 8 && (data[i + 1] & 6) !== 0 && (data[i + 2] & 240) !== 0 && (data[i + 2] & 240) !== 240 && (data[i + 2] & 12) !== 12) return 'mp3'
  }
  throw Error('请使用有效的 MP3、M4A、WAV、OGG 或 FLAC 音频')
}
