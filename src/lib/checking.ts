export type DiffWord = { text: string; kind: 'correct' | 'wrong' | 'missing' }
const small = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
const tens = ['', '', 'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
export function numberWords(value: number): string {
  if (value < 20) return small[value]
  if (value < 100) return `${tens[Math.floor(value / 10)]} ${value % 10 ? small[value % 10] : ''}`.trim()
  if (value < 1000) return `${small[Math.floor(value / 100)]} hundred ${value % 100 ? numberWords(value % 100) : ''}`.trim()
  for (const [scale, label] of [[1e9,'billion'],[1e6,'million'],[1e3,'thousand']] as const) {
    if (value >= scale) return `${numberWords(Math.floor(value / scale))} ${label} ${value % scale ? numberWords(value % scale) : ''}`.trim()
  }
  return String(value)
}
const contractions: Record<string, string> = {
  "can't": 'cannot', "cannot": 'can not', "won't": 'will not', "shan't": 'shall not', "ain't": 'is not',
  "let's": 'let us', "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is', "there's": 'there is',
  "what's": 'what is', "who's": 'who is', "here's": 'here is',
}
export function normalize(text: string): string[] {
  let value = text.toLowerCase().replace(/[’‘]/g, "'").replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1')
  value = value.replace(/\b[\w']+\b/g, word => {
    let expanded = contractions[word] ?? word.replace(/n't$/, ' not').replace(/'ve$/, ' have').replace(/'ll$/, ' will').replace(/'d$/, ' would')
    if (expanded === 'cannot') expanded = 'can not'
    return expanded
  })
  value = value.replace(/\b\d{1,12}\b/g, word => numberWords(Number(word)))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\b(hundred|thousand|million|billion)\s+and\s+/g, '$1 ')
  return value.split(/\s+/).filter(Boolean).slice(0, 400)
}

export function checkAnswer(expected: string, typed: string) {
  const a = normalize(expected), b = normalize(typed)
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  const diff: DiffWord[] = []
  let i = 0, j = 0, correct = 0, chars = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      diff.push({ text: a[i], kind: 'correct' }); correct++; chars += a[i].length; i++; j++
    } else if (j < b.length && (i === a.length || table[i][j + 1] > table[i + 1][j])) {
      diff.push({ text: b[j++], kind: 'wrong' })
    } else diff.push({ text: a[i++], kind: 'missing' })
  }
  // Substitutions appear as a wrong typed word plus its missing expected word.
  const total = Math.max(a.length, b.length)
  return { diff, correct, total, chars, accuracy: total ? Math.round(correct / total * 100) : 100,
    mistakes: diff.filter(word => word.kind === 'missing').map(word => word.text) }
}
