export type WhisperModel = 'tiny' | 'base' | 'small'
export const whisperModels = ['tiny', 'base', 'small'] as const
export const sampleRate = 16000
export type WhisperChunk = {
  text: string
  start: number
  end: number
  confidence?: number
  noSpeech?: number
}
export type WhisperRequest = { id: number; pcm: Float32Array; model: WhisperModel; webgpu: boolean }
export type WhisperReply =
  | { id: number; type: 'progress'; bytes: number }
  | { id: number; type: 'result'; chunks: WhisperChunk[]; wordTimestamps: boolean }
  | { id: number; type: 'error' }

export function defaultModel(webgpu: boolean): WhisperModel {
  return webgpu ? 'base' : 'tiny'
}

export function tokenProbability(logits: ArrayLike<number>, token: number) {
  if (!Number.isFinite(logits[token])) return undefined
  let max = -Infinity
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i])
  let total = 0
  for (let i = 0; i < logits.length; i++) total += Math.exp(logits[i] - max)
  return Math.exp(logits[token] - max) / total
}
