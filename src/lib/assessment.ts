import type { Attempt, Cue, Session } from '../types'
import type { DiffWord } from './checking'

export function attemptResult(
  session: Session,
  at: number,
  next: { mistakes: string[]; spelling?: string[]; correct: number; total: number; chars: number },
) {
  const index = session.attempts.findLastIndex((attempt) => attempt.at === at)
  const old = session.attempts[index]
  if (!old?.mistakes) return session
  const mistakes = { ...session.mistakes }
  const spelling = { ...session.spelling }
  function adjust(counts: Record<string, number>, words: string[], delta: number) {
    for (const word of words) {
      const count = (counts[word] ?? 0) + delta
      if (count > 0) counts[word] = count
      else delete counts[word]
    }
  }
  adjust(mistakes, old.mistakes, -1)
  adjust(mistakes, next.mistakes, 1)
  adjust(spelling, old.spelling ?? [], -1)
  adjust(spelling, next.spelling ?? [], 1)
  const attempts = session.attempts.slice()
  const replacement: Attempt = {
    ...old,
    mistakes: next.mistakes,
    spelling: next.spelling,
    correct: next.correct,
    total: next.total,
    chars: old.ms ? next.chars : 0,
  }
  attempts[index] = replacement
  return { ...session, attempts, mistakes, spelling }
}

export function forgiveDoubtful(diff: DiffWord[], doubtful: Set<number>) {
  if (!doubtful.size) return diff
  const marked: DiffWord[] = []
  for (let i = 0; i < diff.length;) {
    if (diff[i].kind === 'correct') {
      marked.push(diff[i++])
      continue
    }
    let end = i + 1
    while (end < diff.length && diff[end].kind !== 'correct') end++
    const run = diff.slice(i, end)
    const missing = run.filter((word) => word.kind === 'missing')
    const wrong = run.filter((word) => word.kind === 'wrong')
    const forgiven = new Set<DiffWord>()
    missing.forEach((word, index) => {
      if (word.expected !== undefined && doubtful.has(word.expected)) {
        forgiven.add(word)
        if (wrong[index]) forgiven.add(wrong[index])
      }
    })
    marked.push(
      ...run.map((word) => (forgiven.has(word) ? { ...word, kind: 'disputed' as const } : word)),
    )
    i = end
  }
  return marked
}

export function readyAlternative(cue: Cue, ready: Cue[], normalize: (text: string) => string[]) {
  const matches = ready.filter(
    (other) =>
      other.start < cue.end &&
      other.end > cue.start &&
      Math.min(cue.end, other.end) - Math.max(cue.start, other.start) >=
        Math.min(cue.end - cue.start, other.end - other.start) * 0.5,
  )
  if (!matches.length) return undefined
  const text = matches.map((item) => item.text).join(' ')
  return normalize(text).join(' ') === normalize(cue.text).join(' ') ? undefined : text
}

export function markSpelling(diff: DiffWord[], distance: (a: string, b: string) => number) {
  const graded: DiffWord[] = []
  for (let i = 0; i < diff.length;) {
    if (diff[i].kind !== 'wrong' && diff[i].kind !== 'missing') {
      graded.push(diff[i++])
      continue
    }
    let end = i + 1
    while (end < diff.length && (diff[end].kind === 'missing' || diff[end].kind === 'wrong')) end++
    const run = diff.slice(i, end)
    const missing = run.filter((word) => word.kind === 'missing')
    const typed = run.filter((word) => word.kind === 'wrong')
    const matched = new Map<DiffWord, DiffWord>()
    const removed = new Set<DiffWord>()
    for (let j = 0; j < Math.min(missing.length, typed.length); j++) {
      const a = missing[j].text,
        b = typed[j].text
      const limit = a.length >= 7 ? 2 : 1
      if (
        /^[a-z]{2,}$/.test(a) &&
        /^[a-z]{2,}$/.test(b) &&
        Math.abs(a.length - b.length) <= limit &&
        distance(a, b) <= limit
      ) {
        matched.set(typed[j], missing[j])
        removed.add(missing[j])
      }
    }
    for (const word of run)
      if (!removed.has(word))
        graded.push(
          matched.has(word)
            ? { ...word, expected: matched.get(word)?.expected, kind: 'spelling' }
            : word,
        )
    i = end
  }
  return graded
}
