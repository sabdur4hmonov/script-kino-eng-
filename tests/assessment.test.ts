import { expect, test } from 'vitest'
import { checkAnswer, normalize } from '../src/lib/checking'
import { attemptResult, readyAlternative } from '../src/lib/assessment'
import type { Session } from '../src/types'

test('a disputed replacement does not reduce accuracy or appear in mistakes', () => {
  const result = checkAnswer('The green train.', 'The blue train.', [
    { text: 'The', start: 0, end: 0.2 },
    { text: 'green', start: 0.2, end: 0.5, confidence: 0.3 },
    { text: 'train.', start: 0.5, end: 0.8 },
  ])
  expect(result.accuracy).toBe(100)
  expect(result.mistakes).toEqual([])
  expect(result.diff.filter((word) => word.kind === 'disputed').map((word) => word.text)).toEqual([
    'green',
    'blue',
  ])
})

test('ready subtitles align by time and corrections replace only their own attempt counts', () => {
  const cue = { id: 'ai', start: 1, end: 3, text: 'The train arrived.' }
  expect(readyAlternative(cue, [{ ...cue, text: 'The train departed.' }], normalize)).toBe(
    'The train departed.',
  )
  expect(readyAlternative(cue, [{ ...cue, start: 5, end: 7 }], normalize)).toBeUndefined()
  const old = {
    cueId: 'ai',
    at: 3,
    device: 'desktop' as const,
    ms: 500,
    correct: 2,
    total: 3,
    chars: 9,
    mistakes: ['arrived'],
  }
  const session: Session = {
    cues: [cue],
    fingerprint: 'a',
    source: 'AI',
    offset: 0,
    index: 0,
    edits: {},
    completed: false,
    attempts: [old],
    mistakes: { arrived: 2 },
  }
  const updated = attemptResult(
    session,
    3,
    checkAnswer('The train departed.', 'The train departed.'),
  )
  expect(updated.mistakes).toEqual({ arrived: 1 })
  expect(updated.attempts[0].correct).toBe(3)
  expect(attemptResult(updated, 3, old).mistakes).toEqual(session.mistakes)
})
