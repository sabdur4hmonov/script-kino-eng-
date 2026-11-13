import type { Cue } from '../types'
import type { WhisperChunk, WhisperModel } from './whisper-types'

export const doubtfulThreshold = 0.55
export type TranscriptWindow = {
  start: number
  end: number
  chunks: WhisperChunk[]
  wordTimestamps: boolean
  model: WhisperModel
}
export type Corpus = { duration: number; windows: TranscriptWindow[] }
export const aheadSeconds = 300

export function nextWindow(corpus: Corpus, position: number, priority?: number) {
  const goal = Math.min(corpus.duration, (priority ?? position) + aheadSeconds)
  let start = priority ?? position
  for (const window of corpus.windows) {
    if (window.end <= start + 0.001) continue
    if (window.start > start + 0.001)
      return start < goal - 0.001 ? { start, end: Math.min(window.start, start + 30) } : undefined
    start = window.end
  }
  return start < goal - 0.001 ? { start, end: Math.min(corpus.duration, start + 30) } : undefined
}

function noise(text: string) {
  return (
    !/[a-z]/i.test(text) ||
    /^(?:\[[^\]]+\]|\([^)]*(?:music|singing)[^)]*\)|[♪♫].*[♪♫])$/i.test(text) ||
    /^(?:thank(?:s| you) for watching|please subscribe)[.! ]*$/i.test(text)
  )
}

export function sentences(window: TranscriptWindow, includeShort: boolean): Cue[] {
  const cues: Cue[] = []
  let words: WhisperChunk[] = []
  const flush = () => {
    const text = words
      .map((word) => word.text)
      .join(' ')
      .replace(/\s+([.?!,])/g, '$1')
      .trim()
    const repetitions = text.toLowerCase().match(/[a-z']+/g) ?? []
    if (
      (includeShort || repetitions.length >= 3) &&
      !noise(text) &&
      !(repetitions.length >= 4 && new Set(repetitions).size === 1)
    ) {
      const first = words[0]
      const last = words.at(-1)!
      const start = window.start + first.start
      const end = window.start + last.end
      if (end > start)
        cues.push({
          id: `ai-${window.start}-${first.start}`,
          start,
          end,
          text,
          words: words.map((word) => ({
            ...word,
            start: window.start + word.start,
            end: window.start + word.end,
          })),
          model: window.model,
        })
    }
    words = []
  }
  for (const chunk of window.chunks) {
    if ((chunk.noSpeech ?? 0) >= 0.65 || (chunk.confidence ?? 1) < 0.12 || noise(chunk.text)) {
      flush()
      continue
    }
    const tokens = chunk.text.trim().split(/\s+/)
    for (const text of tokens) {
      const last = words.at(-1)
      if ((last && chunk.start - last.end >= 0.8) || words.length === 20) flush()
      words.push({ ...chunk, text })
      if (/[.?!][”"']?$/.test(text)) flush()
    }
  }
  flush()
  return cues.filter(
    (cue, index) =>
      !cues
        .slice(Math.max(0, index - 3), index)
        .some((previous) => previous.text.toLowerCase() === cue.text.toLowerCase()),
  )
}

export function coverage(corpus: Corpus) {
  let end = 0
  for (const part of corpus.windows) {
    if (part.start > end + 0.001) break
    end = Math.max(end, part.end)
  }
  return end
}
