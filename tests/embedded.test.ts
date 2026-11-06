import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { inspectMkv } from '../src/lib/embedded-mkv'
import { inspectMp4 } from '../src/lib/embedded-mp4'

const fixture = async (name: string) =>
  new Blob([await readFile(new URL(`../test-media/${name}`, import.meta.url))])
it('extracts SRT and ASS MKV tracks with language, timing and styling removed', async () => {
  for (const name of ['sample-srt.mkv', 'sample-ass.mkv', 'sample-ac3.mkv', 'sample-vtt.mkv']) {
    const info = await inspectMkv(await fixture(name))
    expect(info.tracks.length).toBeGreaterThan(0)
    const track = info.tracks.find((item) => item.language === 'eng')!
    expect(track.supported).toBe(true)
    const progress: number[] = []
    const cues = await info.extract(track.id, new AbortController().signal, (value) =>
      progress.push(value),
    )
    expect(cues.map((item) => item.text)).toEqual([
      "Don't forget your twenty tickets.",
      'We are going home tonight.',
      'Practice makes progress.',
    ])
    expect(cues[0].start).toBeCloseTo(1, 1)
    expect(cues[0].end).toBeCloseTo(3, 1)
    expect(progress.at(-1)).toBe(100)
  }
})
it('extracts MP4 timed text without reading video samples', async () => {
  const info = await inspectMp4(await fixture('sample.mp4'))
  expect(info.tracks).toHaveLength(1)
  expect(info.tracks[0].codec).toBe('tx3g')
  const cues = await info.extract(info.tracks[0].id, new AbortController().signal, () => {})
  expect(cues).toHaveLength(3)
  expect(cues[0].text).toBe("Don't forget your twenty tickets.")
  expect(cues[0].start).toBeCloseTo(1, 1)
  expect(cues[0].end).toBeCloseTo(3, 1)
})
