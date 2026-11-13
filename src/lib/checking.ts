import { forgiveDoubtful, markSpelling } from './assessment'
import type { WhisperChunk } from './whisper-types'

export type DiffWord = {
  text: string
  kind: 'correct' | 'wrong' | 'missing' | 'disputed' | 'spelling'
  expected?: number
  typed?: number
}
const small = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
export function numberWords(value: number): string {
  if (value < 20) return small[value]
  if (value < 100)
    return `${tens[Math.floor(value / 10)]} ${value % 10 ? small[value % 10] : ''}`.trim()
  if (value < 1000)
    return `${small[Math.floor(value / 100)]} hundred ${value % 100 ? numberWords(value % 100) : ''}`.trim()
  for (const [scale, label] of [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
  ] as const) {
    if (value >= scale)
      return `${numberWords(Math.floor(value / scale))} ${label} ${value % scale ? numberWords(value % scale) : ''}`.trim()
  }
  return String(value)
}
const contractions: Record<string, string> = {
  "can't": 'cannot',
  cannot: 'can not',
  "won't": 'will not',
  "shan't": 'shall not',
  "ain't": 'is not',
  "let's": 'let us',
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "he's": 'he is',
  "she's": 'she is',
  "it's": 'it is',
  "that's": 'that is',
  "there's": 'there is',
  "what's": 'what is',
  "who's": 'who is',
  "here's": 'here is',
}
const fillers = new Set(['um', 'uh', 'er', 'hmm', 'mm'])
const variants: Record<string, string> = {
  colour: 'color',
  colours: 'colors',
  coloured: 'colored',
  colouring: 'coloring',
  centre: 'center',
  centres: 'centers',
  centred: 'centered',
  theatre: 'theater',
  favourite: 'favorite',
  honour: 'honor',
  labour: 'labor',
  flavour: 'flavor',
  neighbour: 'neighbor',
  travelling: 'traveling',
  travelled: 'traveled',
  organise: 'organize',
  organised: 'organized',
  organising: 'organizing',
  organisation: 'organization',
  realise: 'realize',
  realised: 'realized',
  realising: 'realizing',
  recognise: 'recognize',
  apologise: 'apologize',
  summarise: 'summarize',
  analyse: 'analyze',
  specialise: 'specialize',
  ok: 'okay',
}
export function editDistance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1]
    for (let j = 0; j < b.length; j++)
      next.push(Math.min(row[j + 1] + 1, next[j] + 1, row[j] + Number(a[i] !== b[j])))
    row = next
  }
  return row[b.length]
}

export function normalize(text: string): string[] {
  let value = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(
      /\b(gonna|wanna|gotta)\b/g,
      (word) => ({ gonna: 'going to', wanna: 'want to', gotta: 'got to' })[word]!,
    )
    .replace(/(^|\s)'cause\b/g, '$1because')
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1')
  value = value.replace(/\b[\w']+\b/g, (word) => {
    let expanded =
      contractions[word] ??
      word
        .replace(/n't$/, ' not')
        .replace(/'ve$/, ' have')
        .replace(/'ll$/, ' will')
        .replace(/'d$/, ' would')
    if (expanded === 'cannot') expanded = 'can not'
    return expanded
  })
  value = value
    .replace(/\b\d{1,12}\b/g, (word) => numberWords(Number(word)))
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(hundred|thousand|million|billion)\s+and\s+/g, '$1 ')
  return value
    .split(/\s+/)
    .filter((word) => word && !fillers.has(word))
    .map((word) => variants[word] ?? word)
    .slice(0, 400)
}

export function checkAnswer(expected: string, typed: string, words?: WhisperChunk[]) {
  const a = normalize(expected),
    b = normalize(typed)
  // Attribute expanded words back to the characters actually typed: entering
  // "20" must not earn six characters just because it normalizes to "twenty".
  const credits: { word: string; chars: number }[] = []
  typed
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((chunk, index) => {
      const words = normalize(chunk)
      if (
        words.length === 1 &&
        words[0] === 'and' &&
        /^(hundred|thousand|million|billion)$/.test(credits.at(-1)?.word ?? '')
      ) {
        credits[credits.length - 1].chars += chunk.length + 1
        return
      }
      const share = (chunk.length + (index > 0 ? 1 : 0)) / words.length
      words.forEach((word) => credits.push({ word, chars: share }))
    })
  const names = new Set<number>()
  let cursor = 0
  let sentenceStart = true
  for (const word of expected.trim().split(/\s+/)) {
    const items = normalize(word)
    const capitalized = /^["“'‘(]*[A-Z][a-z]+/.test(word)
    if (!sentenceStart && capitalized && items.length === 1 && a[cursor] === items[0])
      names.add(cursor)
    if (items.length) sentenceStart = /[.!?][”"')]*$/.test(word)
    cursor += items.length
  }
  const nameMatches = (i: number, j: number) =>
    names.has(i) &&
    /^[a-z]+$/.test(b[j]) &&
    Math.abs(a[i].length - b[j].length) <= 2 &&
    editDistance(a[i], b[j]) <= 2
  const matches = (i: number, j: number) => a[i] === b[j] || nameMatches(i, j)
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i][j] = matches(i, j)
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
  const diff: DiffWord[] = []
  let i = 0,
    j = 0,
    correct = 0,
    chars = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && matches(i, j)) {
      diff.push({ text: a[i], kind: 'correct' })
      correct++
      chars += credits[j]?.chars ?? 0
      i++
      j++
    } else if (j < b.length && (i === a.length || table[i][j + 1] > table[i + 1][j])) {
      diff.push({ text: b[j], kind: 'wrong', typed: j })
      j++
    } else {
      diff.push({ text: a[i], kind: 'missing', expected: i })
      i++
    }
  }
  // Substitutions appear as a wrong typed word plus its missing expected word.
  const doubtful = new Set<number>()
  if (words && normalize(words.map((word) => word.text).join(' ')).join(' ') === a.join(' ')) {
    let index = 0
    for (const word of words) {
      const count = normalize(word.text).length
      if (word.confidence !== undefined && word.confidence < 0.55)
        for (let j = 0; j < count; j++) doubtful.add(index + j)
      index += count
    }
  }
  const graded = markSpelling(forgiveDoubtful(diff, doubtful), editDistance)
  const spelling = graded.filter((word) => word.kind === 'spelling')
  correct += spelling.length / 2
  chars += spelling.reduce((sum, word) => sum + (credits[word.typed ?? -1]?.chars ?? 0) / 2, 0)
  const disputedExpected = graded.filter(
    (word) => word.kind === 'disputed' && word.expected !== undefined,
  ).length
  const disputedTyped = graded.filter(
    (word) => word.kind === 'disputed' && word.expected === undefined,
  ).length
  const total = Math.max(a.length - disputedExpected, b.length - disputedTyped)
  chars = Math.round(chars)
  return {
    diff: graded,
    correct,
    total,
    chars,
    accuracy: total ? Math.round((correct / total) * 100) : 100,
    mistakes: graded
      .filter((word) => word.kind === 'missing' && !names.has(word.expected ?? -1))
      .map((word) => word.text),
    spelling: spelling.map((word) => word.text),
  }
}
