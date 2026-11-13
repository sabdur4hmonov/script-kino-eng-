import { Input, BlobSource, UrlSource, MP4, QTFF, MATROSKA, WEBM, MP3, WAVE, OGG } from 'mediabunny'
import type { MediaScan } from '../types'
import { inspectMkv } from './embedded-mkv'
import { inspectMp4 } from './embedded-mp4'
import { requireRange } from './media-input'

export async function scanMedia(
  file: File | URL,
  size = file instanceof URL ? 0 : file.size,
  signal?: AbortSignal,
): Promise<MediaScan> {
  const source =
    file instanceof URL
      ? new UrlSource(file, {
          maxCacheSize: 8 * 1024 * 1024,
          getRetryDelay: () => null,
          requestInit: { credentials: 'omit' },
          fetchFn: async (...args) => {
            const response = await fetch(...args)
            await requireRange(response)
            return response
          },
        })
      : new BlobSource(file)
  const input = new Input({ source, formats: [MP4, QTFF, MATROSKA, WEBM, MP3, WAVE, OGG] })
  const cancel = () => input.dispose()
  signal?.addEventListener('abort', cancel, { once: true })
  const dispose = () => {
    signal?.removeEventListener('abort', cancel)
    input.dispose()
  }
  try {
    signal?.throwIfAborted()
    const [audio, video, format] = await Promise.all([
      input.getPrimaryAudioTrack(),
      input.getPrimaryVideoTrack(),
      input.getFormat(),
    ])
    let audioWarning = !audio,
      audioCodec = ''
    if (audio) {
      audioCodec = (await audio.getCodec()) ?? String(audio.internalCodecId ?? 'unknown')
      const codec = await audio.getCodecParameterString().catch(() => null)
      const container =
        format === OGG
          ? 'ogg'
          : format === WEBM
            ? 'webm'
            : format === WAVE
              ? 'wav'
              : format === MP3
                ? 'mpeg'
                : 'mp4'
      const mime =
        codec && (container === 'mp4' || container === 'webm' || container === 'ogg')
          ? `audio/${container}; codecs="${codec}"`
          : `audio/${container}`
      audioWarning = document.createElement('audio').canPlayType(mime) === ''
      if (navigator.mediaCapabilities && codec) {
        try {
          const capability = await navigator.mediaCapabilities.decodingInfo({
            type: 'file',
            audio: {
              contentType: mime,
              channels: String(await audio.getNumberOfChannels()),
              bitrate: 192000,
              samplerate: await audio.getSampleRate(),
            },
          })
          audioWarning = !capability.supported
        } catch {
          /* Retain the native canPlayType result. */
        }
      }
    }
    const blob =
      file instanceof URL
        ? {
            size,
            slice(start = 0, end = size) {
              return {
                async arrayBuffer() {
                  if (end <= start) return new ArrayBuffer(0)
                  const response = await fetch(file, {
                    headers: { Range: `bytes=${start}-${end - 1}` },
                    credentials: 'omit',
                    signal,
                  })
                  const range = await requireRange(response)
                  if (+range[1] !== start || +range[2] !== end - 1 || +range[3] !== size) {
                    await response.body?.cancel()
                    throw new Error('Unexpected byte range')
                  }
                  return response.arrayBuffer()
                },
              }
            },
          }
        : file
    const subtitles = await (
      format === MP4 || format === QTFF
        ? inspectMp4(blob)
        : format === MATROSKA || format === WEBM
          ? inspectMkv(blob)
          : Promise.resolve(undefined)
    ).catch(() => undefined)
    return {
      tracks: subtitles?.tracks ?? [],
      extract: subtitles?.extract ?? (async () => []),
      audioWarning,
      audioCodec,
      audioOnly: !video,
      input,
      audio,
      dispose,
    }
  } catch (error) {
    dispose()
    throw error
  }
}
