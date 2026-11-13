import { AudioSampleSink } from 'mediabunny'
import type { InputAudioTrack } from 'mediabunny'
import { sampleRate } from './whisper-types'

export type DecodeWindow = (
  start: number,
  end: number,
  signal: AbortSignal,
) => Promise<Float32Array>

export function audioWindows(track: InputAudioTrack): DecodeWindow {
  const sink = new AudioSampleSink(track)
  return async (start, end, signal) => {
    const mono = new Float32Array(Math.ceil((end - start) * sampleRate))
    for await (const sample of sink.samples(Math.max(0, start - 0.2), end)) {
      try {
        signal.throwIfAborted()
        const first = Math.max(0, Math.ceil((sample.timestamp - start) * sampleRate))
        const last = Math.min(
          mono.length,
          Math.ceil((sample.timestamp + sample.duration - start) * sampleRate),
        )
        const plane = new Float32Array(sample.numberOfFrames)
        for (let channel = 0; channel < sample.numberOfChannels; channel++) {
          sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar' })
          const stride = sample.sampleRate / sampleRate
          for (let i = first; i < last; i++) {
            const from = Math.max(0, ((start - sample.timestamp) * sampleRate + i) * stride)
            // Average source samples over the destination interval when downsampling.
            let sum = 0,
              weight = 0
            const until = Math.min(plane.length, from + stride)
            for (let j = Math.floor(from); j < until; j++) {
              const fraction = Math.min(until, j + 1) - Math.max(from, j)
              sum += plane[j] * fraction
              weight += fraction
            }
            if (weight) mono[i] += sum / (weight * sample.numberOfChannels)
          }
        }
      } finally {
        sample.close()
      }
    }
    return mono
  }
}

export const windowSeconds = 30
export function quietCut(pcm: Float32Array, atEnd: boolean) {
  if (atEnd) return pcm.length
  const frame = Math.floor(sampleRate * 0.04)
  let cut = pcm.length,
    lowest = Infinity
  for (let i = Math.max(frame, pcm.length - sampleRate * 4); i + frame < pcm.length; i += frame) {
    let power = 0
    for (let j = i - frame; j < i + frame; j++) power += pcm[j] ** 2
    const value = power / (2 * frame)
    if (value < lowest) {
      lowest = value
      cut = i
    }
  }
  return lowest < 0.0001 ? cut : pcm.length
}
