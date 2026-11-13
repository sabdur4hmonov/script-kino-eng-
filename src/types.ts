import type { WhisperChunk, WhisperModel } from './lib/whisper-types'

export type Cue = {
  id: string
  start: number
  end: number
  text: string
  words?: WhisperChunk[]
  model?: WhisperModel
  alternative?: string
}
export type Device = 'phone' | 'desktop'
export type Attempt = {
  cueId: string
  correct: number
  total: number
  chars: number
  ms: number
  device: Device
  at: number
}
export type Session = {
  fingerprint: string
  cues: Cue[]
  source: string
  offset: number
  index: number
  edits: Record<string, string>
  attempts: Attempt[]
  mistakes: Record<string, number>
  completed: boolean
  work?: {
    cueId: string
    answer: string
    ms: number
    device: Device
    checked: boolean
    revealed: boolean
  }
}
export type Track = {
  id: string
  language: string
  name: string
  codec: string
  supported: boolean
}
export type MediaScan = {
  input: import('mediabunny').Input
  audio: import('mediabunny').InputAudioTrack | null
  audioOnly: boolean
  localFile?: File
  tracks: Track[]
  audioWarning: boolean
  audioCodec: string
  extract: (id: string, signal: AbortSignal, progress: (n: number) => void) => Promise<Cue[]>
  dispose: () => void
}
