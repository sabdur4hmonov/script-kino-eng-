import { pipeline, TextStreamer, env } from '@huggingface/transformers'
import type {
  AutomaticSpeechRecognitionPipeline,
  ProgressInfo,
  Tensor,
} from '@huggingface/transformers'
import { sampleRate, tokenProbability } from './whisper-types'
import type { WhisperChunk, WhisperModel } from './whisper-types'

type Backend = 'webgpu' | 'wasm' | 'cpu'
type TimestampOutput = {
  text: string
  chunks?: { text: string; timestamp: [number, number | null] }[]
}
let active: { key: string; recognizer: AutomaticSpeechRecognitionPipeline } | undefined

async function load(model: WhisperModel, device: Backend, report: (bytes: number) => void) {
  const key = `${model}-${device}`
  if (active?.key === key) return active.recognizer
  if (active) await active.recognizer.dispose()
  active = undefined
  env.allowLocalModels = false
  if (device !== 'cpu') env.useBrowserCache = typeof caches !== 'undefined'
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.numThreads = 1
    env.backends.onnx.wasm.proxy = false
  }
  const loaded = new Map<string, number>()
  const recognizer = await pipeline(
    'automatic-speech-recognition',
    `onnx-community/whisper-${model}.en_timestamped`,
    {
      device,
      dtype: 'q8',
      progress_callback: (event: ProgressInfo) => {
        if (event.status === 'progress' && 'loaded' in event && 'file' in event) {
          loaded.set(event.file, event.loaded)
          report([...loaded.values()].reduce((total, size) => total + size, 0))
        }
      },
    },
  )
  active = { key, recognizer }
  return recognizer
}

export async function transcribePcm(
  pcm: Float32Array,
  model: WhisperModel,
  device: Backend,
  report: (bytes: number) => void = () => {},
) {
  let recognizer: AutomaticSpeechRecognitionPipeline
  try {
    recognizer = await load(model, device, report)
  } catch (error) {
    if (device !== 'webgpu') throw error
    recognizer = await load(model, 'wasm', report)
  }
  const duration = pcm.length / sampleRate
  // Capture logits before Whisper masks timestamp/silence tokens. The streamer
  // supplies the actual selected token, including when it is a timestamp.
  let scores: { token: number; value: number }[] = []
  let noSpeech: number | undefined
  let nextLogits: Float32Array | undefined
  const stream = new TextStreamer(recognizer.tokenizer)
  stream.end = () => {
    nextLogits = undefined
  }
  stream.put = ([[token]]) => {
    if (token === undefined || !nextLogits) return
    const value = tokenProbability(nextLogits, Number(token))
    if (value !== undefined) scores.push({ token: Number(token), value })
    nextLogits = undefined
  }
  const forward = recognizer.model.forward
  const silenceId = recognizer.tokenizer.convert_tokens_to_ids('<|nospeech|>')
  recognizer.model.forward = async function (inputs) {
    const output = await forward.call(this, inputs)
    const logits = (output.logits as Tensor).slice(null, -1, null).to('float32')
    nextLogits = new Float32Array(logits.data as Float32Array)
    if (!scores.length) noSpeech = tokenProbability(nextLogits, silenceId)
    return output
  }
  let output: TimestampOutput
  let wordTimestamps = true
  try {
    output = (await recognizer(pcm, {
      return_timestamps: 'word',
      streamer: stream,
    })) as TimestampOutput
  } catch {
    scores = []
    noSpeech = undefined
    nextLogits = undefined
    wordTimestamps = false
    output = (await recognizer(pcm, {
      return_timestamps: true,
      streamer: stream,
    })) as TimestampOutput
  } finally {
    recognizer.model.forward = forward
  }
  const tokens = scores.map((score) => score.token)
  // Match character spans in the same tokenizer output so contractions and
  // multiple subword tokens contribute to a single word's confidence.
  const decoded = recognizer.tokenizer.decode(tokens, {
    skip_special_tokens: true,
    clean_up_tokenization_spaces: false,
  })
  const ends = tokens.map(
    (_, i) =>
      recognizer.tokenizer.decode(tokens.slice(0, i + 1), {
        skip_special_tokens: true,
        clean_up_tokenization_spaces: false,
      }).length,
  )
  let cursor = 0
  const chunks: WhisperChunk[] = (
    output.chunks?.length ? output.chunks : [{ text: output.text, timestamp: [0, duration] }]
  ).flatMap(({ text, timestamp }) => {
    const word = text.trim()
    if (!word || timestamp[0] == null) return []
    const from = decoded.indexOf(word, cursor)
    let confidence: number | undefined
    if (from >= 0) {
      const to = from + word.length
      const values = scores.filter(
        (_, i) => ends[i] > from && ends[i] > (ends[i - 1] ?? 0) && (ends[i - 1] ?? 0) < to,
      )
      if (values.length)
        confidence = Math.exp(
          values.reduce((sum, score) => sum + Math.log(Math.max(1e-8, score.value)), 0) /
            values.length,
        )
      cursor = to
    }
    return [
      {
        text: word,
        start: Math.max(0, timestamp[0]),
        end: Math.min(duration, timestamp[1] ?? duration),
        confidence,
        noSpeech,
      },
    ]
  })
  return { chunks, wordTimestamps }
}
