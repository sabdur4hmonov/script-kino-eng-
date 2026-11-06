import type { MediaScan } from '../types'
export async function scanMedia(_file: File): Promise<MediaScan> {
  return { tracks: [], audioWarning: false, audioCodec: '', extract: async () => [], dispose() {} }
}
