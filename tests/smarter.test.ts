import { expect, test } from 'vitest'
import { checkAnswer } from '../src/lib/checking'

test('accepts common informal words, fillers, international variants, and near names', () => {
  expect(
    checkAnswer(
      'Um, I am going to organize the color center with Rachel, okay?',
      'I’m gonna organise the colour centre with Rachell okay',
    ).accuracy,
  ).toBe(100)
  expect(
    checkAnswer('I want to go because we got to leave.', "I wanna go 'cause we gotta leave.")
      .accuracy,
  ).toBe(100)
  expect(checkAnswer('I saw Rachel yesterday.', 'I saw someone yesterday.').mistakes).not.toContain(
    'rachel',
  )
  expect(checkAnswer('I saw her. Rachel left.', 'I saw her. Rachell left.').accuracy).toBeLessThan(
    100,
  )
})
test('counts spelling as half credit and leaves unrelated substitutions unchanged', () => {
  const result = checkAnswer('the green train', 'the gren train')
  expect(result.correct).toBe(2.5)
  expect(result.spelling).toEqual(['gren'])
  expect(result.mistakes).toEqual([])
  expect(result.diff.map((word) => word.kind)).toEqual(['correct', 'spelling', 'correct'])
  expect(checkAnswer('the wonderful train', 'the wondrful train').spelling).toEqual(['wondrful'])
  expect(checkAnswer('the green train', 'the yellow train').mistakes).toEqual(['green'])
})
