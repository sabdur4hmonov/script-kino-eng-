import type { Cue } from '../types'

export function cleanText(text: string): string {
  const withoutStyles = text.replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, ' ').replace(/\\h/g, ' ')
    .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  // Decode entities as text only; subtitle markup is never inserted into the page.
  return withoutStyles.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
    const names: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    if (!entity.startsWith('#')) return names[entity.toLowerCase()] ?? ''
    const value = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : ''
  })
}

export function timestamp(value: string): number {
  const parts = value.replace(',', '.').split(':').map(Number)
  return parts.reduce((sum, part) => sum * 60 + part, 0)
}

export function parseSubtitles(raw: string): Cue[] {
  const blocks = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n/)
  const cues: Cue[] = []
  for (const block of blocks) {
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(block)) continue
    const lines = block.split('\n')
    const timeIndex = lines.findIndex(line => line.includes('-->'))
    if (timeIndex < 0) continue
    const match = lines[timeIndex].match(/((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{1,3})/)
    if (!match) continue
    const start = timestamp(match[1]), end = timestamp(match[2])
    const text = cleanText(lines.slice(timeIndex + 1).join(' '))
    if (text && Number.isFinite(start) && end > start) cues.push({ id: `cue-${cues.length}`, start, end, text })
  }
  return cues.sort((a, b) => a.start - b.start)
}

export function timeLabel(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds))
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
}
