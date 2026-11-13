import { test, expect } from 'vitest'
import { fallbackCodec } from '../src/lib/ffmpeg-audio'

test('limits the expensive fallback to the requested unsupported codec families', () => {
  for (const codec of ['ac3', 'AC-3', 'E-AC3', 'ec-3', 'A_EAC3', 'dts'])
    expect(fallbackCodec(codec)).toBe(true)
  for (const codec of ['aac', 'opus', 'mp3', 'unknown']) expect(fallbackCodec(codec)).toBe(false)
})
