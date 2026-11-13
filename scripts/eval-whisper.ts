import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { MEDIA_EXTENSIONS } from '../src/lib/media-input.ts'
import { editDistance, normalize } from '../src/lib/checking.ts'
import { parseSubtitles } from '../src/lib/subtitles.ts'
import { quietCut } from '../src/lib/audio-window.ts'
import { sentences } from '../src/lib/transcript.ts'
import { sampleRate, whisperModels } from '../src/lib/whisper-types.ts'
import type { WhisperModel } from '../src/lib/whisper-types.ts'

const exec = promisify(execFile)
const root = resolve('test-media/eval')
const modelArg = process.argv.slice(2)
if (modelArg.some((model) => !whisperModels.includes(model as WhisperModel))) {
  throw new Error('Choose tiny, base, or small.')
}
const models = modelArg.length ? (modelArg as WhisperModel[]) : whisperModels
const entries = await readdir(root).catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') return []
  throw error
})
const jobs = []
for (const file of entries) {
  const extension = extname(file)
  if (!MEDIA_EXTENSIONS.split(',').includes(extension.toLowerCase())) continue
  const subtitle = join(root, basename(file, extension) + '.srt')
  if (await stat(subtitle).catch(() => undefined)) jobs.push({ file: join(root, file), subtitle })
}
if (!jobs.length) {
  console.log(
    'Add a media file and matching .srt under test-media/eval/, then run this command again.',
  )
} else {
  const { transcribePcm } = await import('../src/lib/whisper-engine.ts')
  function words(text: string) {
    return (
      text.match(/[^.?!]+[.?!]*/g)?.flatMap((part) => {
        const tokens = part.trim().split(/\s+/)
        const normalized: string[] = []
        for (let i = 0; i < tokens.length; i += 100)
          normalized.push(...normalize(tokens.slice(i, i + 100).join(' ')))
        return normalized
      }) ?? []
    )
  }
  function wordErrors(reference: string[], output: string[]) {
    const ids = new Map<string, string>()
    const encode = (tokens: string[]) =>
      tokens
        .map((token) => {
          if (!ids.has(token)) ids.set(token, String.fromCharCode(ids.size + 1))
          return ids.get(token)!
        })
        .join('')
    return editDistance(encode(reference), encode(output))
  }
  for (const model of models) {
    let errors = 0,
      wordCount = 0,
      elapsed = 0,
      minutes = 0
    for (const job of jobs) {
      const { stdout: metadata } = await exec('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        job.file,
      ])
      const duration = Number(metadata.trim())
      if (!(duration > 0) || !Number.isFinite(duration))
        throw new Error('Could not read duration for ' + job.file)
      const reference = parseSubtitles(await readFile(job.subtitle, 'utf8')).flatMap((cue) =>
        words(cue.text),
      )
      if (!reference.length) throw new Error('Reference has no subtitle words: ' + job.subtitle)
      const started = performance.now()
      const output = []
      for (let start = 0; start < duration - 0.001;) {
        const end = Math.min(duration, start + 30)
        const { stdout } = await exec(
          'ffmpeg',
          [
            '-v',
            'error',
            '-nostdin',
            '-ss',
            String(start),
            '-i',
            job.file,
            '-t',
            String(end - start),
            '-vn',
            '-ar',
            String(sampleRate),
            '-ac',
            '1',
            '-f',
            'f32le',
            'pipe:1',
          ],
          { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 },
        )
        const pcm = new Float32Array(Uint8Array.from(stdout).buffer)
        const cut = quietCut(pcm, end >= duration - 0.001 || pcm.length < sampleRate * 29)
        if (!cut) break
        const next = Math.min(end, start + cut / sampleRate)
        const clip = pcm.subarray(0, cut)
        if (clip.some((sample) => Math.abs(sample) > 0.002)) {
          const result = await transcribePcm(clip, model, 'cpu')
          output.push(
            ...sentences({ ...result, model, start, end: next }, false).flatMap((cue) =>
              words(cue.text),
            ),
          )
        }
        start = next
      }
      const time = (performance.now() - started) / 1000
      const distance = wordErrors(reference, output)
      console.log(
        `${model}  ${basename(job.file)}  WER ${((100 * distance) / reference.length).toFixed(1)}%  ${(time / (duration / 60)).toFixed(1)} s/audio min`,
      )
      errors += distance
      wordCount += reference.length
      elapsed += time
      minutes += duration / 60
    }
    console.log(
      `${model}  overall WER ${((100 * errors) / wordCount).toFixed(1)}%  average ${(elapsed / minutes).toFixed(1)} s/audio min`,
    )
  }
}
