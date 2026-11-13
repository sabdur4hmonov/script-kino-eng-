import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { sampleRate } from './whisper-types'

const core = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.9/dist/esm/ffmpeg-core'
export const fallbackCodec = (codec: string) =>
  /^(?:ac-?3|e-?ac-?3|ec-3|dts|a_ac3|a_eac3|a_dts)$/i.test(codec)

export function fallbackAudio(file: File, lifetime: AbortSignal) {
  const ffmpeg = new FFmpeg()
  const stop = () => ffmpeg.terminate()
  lifetime.addEventListener('abort', stop, { once: true })
  let ready: Promise<void> | undefined
  let queue = Promise.resolve<unknown>(undefined)
  async function mount() {
    lifetime.throwIfAborted()
    const response = await fetch(core + '.js', { signal: lifetime, credentials: 'omit' })
    if (!response.ok) throw new Error('FFmpeg core unavailable')
    const module = URL.createObjectURL(
      new Blob([await response.text()], { type: 'text/javascript' }),
    )
    try {
      await ffmpeg.load({ coreURL: module, wasmURL: core + '.wasm' })
    } finally {
      URL.revokeObjectURL(module)
    }
    await ffmpeg.createDir('/media')
    await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name: 'input', data: file }] }, '/media')
  }
  function run(start: number, end: number, format: 'f32le' | 'opus', signal: AbortSignal) {
    const job = queue.then(async () => {
      lifetime.throwIfAborted()
      signal.throwIfAborted()
      await (ready ??= mount())
      signal.throwIfAborted()
      const output = format === 'opus' ? '/clip.ogg' : '/clip.pcm'
      const options =
        format === 'opus'
          ? ['-c:a', 'libopus', '-b:a', '64k', '-f', 'ogg']
          : ['-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_f32le', '-f', 'f32le']
      try {
        const status = await ffmpeg.exec(
          [
            '-ss',
            String(start),
            '-i',
            '/media/input',
            '-t',
            String(end - start),
            '-map',
            '0:a:0',
            '-vn',
            ...options,
            output,
          ],
          120_000,
        )
        lifetime.throwIfAborted()
        signal.throwIfAborted()
        if (status !== 0) throw new Error('FFmpeg could not decode this clip')
        const bytes = await ffmpeg.readFile(output)
        if (typeof bytes === 'string') throw new Error('Expected binary audio')
        return Uint8Array.from(bytes)
      } finally {
        await ffmpeg.deleteFile(output).catch(() => {})
      }
    })
    queue = job.catch(() => {})
    return job
  }
  return {
    async decode(start: number, end: number, signal: AbortSignal) {
      const bytes = await run(start, end, 'f32le', signal)
      const samples = new Float32Array(bytes.buffer)
      if (samples.length === Math.ceil((end - start) * sampleRate)) return samples
      const padded = new Float32Array(Math.ceil((end - start) * sampleRate))
      padded.set(samples.subarray(0, padded.length))
      return padded
    },
    async clip(start: number, end: number, signal: AbortSignal) {
      return new Blob([await run(start, end, 'opus', signal)], { type: 'audio/ogg; codecs=opus' })
    },
    dispose() {
      lifetime.removeEventListener('abort', stop)
      stop()
    },
  }
}
