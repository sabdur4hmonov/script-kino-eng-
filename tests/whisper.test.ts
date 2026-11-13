import { expect, test } from 'vitest'
import { defaultModel, tokenProbability } from '../src/lib/whisper-types'

test('selects the requested default and retains real token probabilities', () => {
  expect(defaultModel(true)).toBe('base')
  expect(defaultModel(false)).toBe('tiny')
  expect(tokenProbability([1000, 1000, -Infinity], 0)).toBeCloseTo(0.5)
  expect(tokenProbability([1000, 1000, -Infinity], 2)).toBeUndefined()
})
