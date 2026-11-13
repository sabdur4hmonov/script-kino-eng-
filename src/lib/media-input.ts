export const MEDIA_EXTENSIONS = '.mp4,.mkv,.webm,.mov,.mp3,.m4a,.wav,.ogg'
const pageHosts = [
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'tiktok.com',
  't.me',
  'drive.google.com',
  'disk.yandex',
]

export function mediaLink(value: string) {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return { error: 'invalid' } as const
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    pageHosts.some((domain) => host === domain || host.endsWith('.' + domain)) ||
    /(^|\.)disk\.yandex\.[a-z.]+$/.test(host)
  )
    return { error: 'page' } as const
  if (url.protocol !== 'https:' || url.username || url.password)
    return { error: 'invalid' } as const
  url.hash = ''
  return { url } as const
}

export async function requireRange(response: Response) {
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get('content-range') ?? '')
  if (
    response.status === 206 &&
    range &&
    Number(range[1]) <= Number(range[2]) &&
    Number(range[2]) < Number(range[3])
  )
    return range
  await response.body?.cancel()
  throw new Error('Media server must expose a valid HTTP Content-Range')
}

export async function probeMedia(url: URL, signal: AbortSignal) {
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-0' },
    credentials: 'omit',
    signal,
  })
  const range = await requireRange(response)
  await response.body?.cancel()
  if (range[1] !== '0' || range[2] !== '0' || !Number.isSafeInteger(Number(range[3])))
    throw new Error('Invalid media probe')
  const size = Number(range[3])
  const raw = url.pathname.split('/').pop() || url.hostname
  let name = raw
  try {
    name = decodeURIComponent(raw)
  } catch {
    /* Keep an opaque path printable. */
  }
  const validator = response.headers.get('etag') ?? response.headers.get('last-modified') ?? ''
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([url.href, size, validator])),
  )
  return {
    name,
    size,
    key:
      'url:' +
      Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  }
}
