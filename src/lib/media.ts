import { Input, BlobSource, MP4, MATROSKA } from 'mediabunny'
import type { MediaScan } from '../types'
import { inspectMkv } from './embedded-mkv'
import { inspectMp4 } from './embedded-mp4'

export async function scanMedia(file: File): Promise<MediaScan> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, MATROSKA] })
  try {
    // Mediabunny currently exposes audio/video reading, not subtitle reading.
    // Keep container reading bounded with the same Blob source and range parsers.
    const audio = await input.getPrimaryAudioTrack()
    let audioWarning = !audio, audioCodec = ''
    if (audio) {
      audioCodec = await audio.getCodec() ?? String(audio.internalCodecId ?? 'unknown')
      const codec = await audio.getCodecParameterString().catch(() => null)
      const mime = `audio/mp4; codecs="${codec ?? audioCodec}"`
      const native = document.createElement('video').canPlayType(mime)
      // HTMLMediaElement support differs from WebCodecs; test media playback first.
      audioWarning = native === ''
      if (navigator.mediaCapabilities && codec) {
        try {
          const capability = await navigator.mediaCapabilities.decodingInfo({ type: 'file', audio: {
            contentType: mime, channels: String(await audio.getNumberOfChannels()), bitrate: 192000, samplerate: await audio.getSampleRate(),
          } })
          audioWarning = !capability.supported
        } catch { /* canPlayType remains the fallback. */ }
      }
    }
    const header = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    const subtitles = header[0] === 0x1a && header[1] === 0x45 ? await inspectMkv(file) : await inspectMp4(file)
    return { ...subtitles, audioWarning, audioCodec, dispose: () => input.dispose() }
  } catch (error) { input.dispose(); throw error }
}
