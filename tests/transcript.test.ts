import 'fake-indexeddb/auto'
import { expect, test } from 'vitest'
import { loadTranscript, saveTranscript } from '../src/lib/storage'
import { coverage, nextWindow, sentences } from '../src/lib/transcript'
import type { TranscriptWindow } from '../src/lib/transcript'
import { quietCut } from '../src/lib/audio-window'

const window: TranscriptWindow = {
  start: 0,
  end: 30,
  model: 'tiny',
  wordTimestamps: true,
  chunks: [
    { text: 'The', start: 0.4, end: 0.6 },
    { text: 'green', start: 0.6, end: 1, confidence: 0.33 },
    { text: 'train.', start: 1, end: 1.4 },
    { text: '[Music]', start: 2, end: 3 },
    { text: 'Thank you for watching.', start: 4, end: 5 },
    { text: 'Keep that door closed.', start: 6, end: 7, noSpeech: 0.8 },
    { text: 'Yeah.', start: 8, end: 9 },
  ],
}

test('builds timed cues, retains uncertain words, and filters silence and common hallucinations', () => {
  expect(sentences(window, false).map((cue) => cue.text)).toEqual(['The green train.'])
  expect(sentences(window, false)[0]).toMatchObject({
    start: 0.4,
    end: 1.4,
    words: [{ text: 'The' }, { text: 'green', confidence: 0.33 }, { text: 'train.' }],
  })
  expect(sentences(window, true).map((cue) => cue.text)).toEqual(['The green train.', 'Yeah.'])
})

test('resumes saved windows, limits lookahead and prioritizes distant jumps', async () => {
  const original = { duration: 900, windows: [window] }
  await saveTranscript('transcript-test', original)
  const restored = (await loadTranscript('transcript-test'))!
  expect(coverage(restored)).toBe(30)
  expect(nextWindow(restored, 2)).toEqual({ start: 30, end: 60 })
  expect(nextWindow(restored, 2, 600)).toEqual({ start: 600, end: 630 })
  expect(nextWindow({ duration: 900, windows: [{ ...window, end: 301 }] }, 0)).toBeUndefined()
})

test('cuts at quiet audio near the end and keeps the full final window', () => {
  const audio = new Float32Array(30 * 16000).fill(0.1)
  audio.fill(0, 27 * 16000, 28 * 16000)
  expect(quietCut(audio, false) / 16000).toBeGreaterThan(27)
  expect(quietCut(audio, false) / 16000).toBeLessThan(28)
  expect(quietCut(audio, true)).toBe(audio.length)
})
