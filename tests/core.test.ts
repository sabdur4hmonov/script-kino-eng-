import { describe, expect, it } from 'vitest'
import { checkAnswer, normalize } from '../src/lib/checking'
import { cleanText, parseSubtitles } from '../src/lib/subtitles'
import { RangeReader } from '../src/lib/range-reader'

describe('subtitle parsing', () => {
  it('reads SRT, strips tags and ASS styles, decodes entities and sorts', () => {
    const cues = parseSubtitles(
      '\uFEFF1\r\n00:00:03,000 --> 00:00:04,500\r\n<i>Hello</i> {\\an8}world\\N&amp; friends\r\n\r\n2\r\n00:00:01,000 --> 00:00:02,000\r\nEarlier line',
    )
    expect(cues.map((cue) => cue.text)).toEqual(['Earlier line', 'Hello world & friends'])
    expect(cues[1].end).toBe(4.5)
  })
  it('reads WebVTT cue IDs, settings, multiline text; ignores NOTE, STYLE', () => {
    const cues = parseSubtitles(
      'WEBVTT\n\nNOTE ignore this\n00:00.000 --> 00:01.000\nnot a cue\n\nSTYLE\n::cue { color: red; }\n\nscene-one\n00:02.100 --> 00:04.200 align:start\n<v Alex>We are\ngoing home.</v>',
    )
    expect(cues).toEqual([{ id: 'cue-0', start: 2.1, end: 4.2, text: 'We are going home.' }])
  })
  it('rejects malformed and backwards cues and never returns HTML nodes', () => {
    expect(parseSubtitles('1\n00:02.000 --> 00:01.000\nWrong')).toEqual([])
    expect(cleanText('<img src=x onerror=alert(1)>Safe &#x26; sound')).toBe('Safe & sound')
  })
})
describe('word-level LCS', () => {
  it('counts original typed characters for WPM rather than expanded number words', () => {
    expect(checkAnswer('do not buy twenty', "Don't buy 20").chars).toBe("Don't buy 20".length)
    expect(checkAnswer("don't buy 20", 'do not buy twenty').chars).toBe('do not buy twenty'.length)
  })
  it('accepts contractions, punctuation, number words and British hundreds', () => {
    expect(checkAnswer("Don't buy 20 tickets!", 'do not buy twenty tickets').accuracy).toBe(100)
    expect(checkAnswer("I can't go; she'll arrive.", 'i can not go she will arrive').accuracy).toBe(
      100,
    )
    expect(
      checkAnswer('I paid 125 dollars', 'I paid one hundred and twenty-five dollars').accuracy,
    ).toBe(100)
    expect(checkAnswer('2,000 people', 'two thousand people').accuracy).toBe(100)
  })
  it('distinguishes insertions, omissions and substitutions without losing later matches', () => {
    const result = checkAnswer('we are going home tonight', 'we were going home now')
    expect(result.correct).toBe(3)
    expect(result.diff.filter((item) => item.kind === 'wrong').map((item) => item.text)).toEqual([
      'were',
      'now',
    ])
    expect(result.mistakes).toEqual(['are', 'tonight'])
    expect(checkAnswer('we go home', 'we really go home').accuracy).toBe(75)
  })
  it('handles empty input, curly apostrophes and caps expensive comparisons', () => {
    expect(checkAnswer('You’re ready', 'you are ready').accuracy).toBe(100)
    expect(checkAnswer('one two', '').accuracy).toBe(0)
    expect(normalize('word '.repeat(10000))).toHaveLength(400)
  })
})
describe('bounded reads', () => {
  it('reads only a small window from a simulated 2 GB file', async () => {
    const requested: number[] = []
    const file = {
      size: 2 * 1024 ** 3,
      slice(start: number, end: number) {
        requested.push(end - start)
        return new Blob([new Uint8Array(end - start)])
      },
    } as Blob
    const reader = new RangeReader(file)
    await reader.bytes(0, 16)
    await reader.bytes(file.size - 50, 16)
    expect(Math.max(...requested)).toBeLessThanOrEqual(256 * 1024)
    await expect(reader.bytes(0, 9 * 1024 ** 2)).rejects.toThrow()
  })
  it('supports cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      new RangeReader(new Blob(['test']), controller.signal).bytes(0, 1),
    ).rejects.toThrow()
  })
})
