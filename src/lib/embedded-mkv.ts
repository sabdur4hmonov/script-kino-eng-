import type { Cue, Track } from '../types'
import { cleanText } from './subtitles'
import { RangeReader, ebml, elements } from './range-reader'
import type { Element } from './range-reader'

type MkvTrack = Track & { number: number; duration: number; timeScale: number }
const supported = /^(S_TEXT\/(UTF8|ASS|SSA|WEBVTT)|D_WEBVTT\/(SUBTITLES|CAPTIONS))$/
const topLevel = new Set([0x1f43b675,0x1549a966,0x1654ae6b,0x1c53bb6b,0x114d9b74,0x1941a469,0x1254c367,0x1043a770])
async function float(reader: RangeReader, item: Element) {
  const bytes = await reader.bytes(item.data, item.end - item.data), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return bytes.length === 4 ? view.getFloat32(0) : view.getFloat64(0)
}
export async function inspectMkv(file: Blob) {
  const reader = new RangeReader(file)
  let segment: Element | undefined
  for await (const item of elements(reader, 0, file.size)) if (item.id === 0x18538067) { segment = item; break }
  if (!segment) throw new Error('Missing Matroska segment')
  const tracks: MkvTrack[] = []; let scale = 1_000_000
  for await (const item of elements(reader, segment.data, segment.end)) {
    if (item.id === 0x1549a966) {
      for await (const field of elements(reader, item.data, item.end)) if (field.id === 0x2ad7b1) scale = await reader.uint(field.data, field.end - field.data)
    }
    if (item.id === 0x1654ae6b) for await (const entry of elements(reader, item.data, item.end)) {
      if (entry.id !== 0xae) continue
      let number = 0, type = 0, name = '', language = 'eng', codec = '', duration = 0, encoded = false, timeScale = 1
      for await (const field of elements(reader, entry.data, entry.end)) {
        const length = field.end - field.data
        switch (field.id) {
          case 0xd7: number = await reader.uint(field.data, length); break
          case 0x83: type = await reader.uint(field.data, length); break
          case 0x536e: name = await reader.text(field.data, length); break
          case 0x22b59c: language = await reader.text(field.data, length); break
          case 0x22b59d: language = await reader.text(field.data, length); break
          case 0x86: codec = await reader.text(field.data, length); break
          case 0x23e383: duration = await reader.uint(field.data, length) / 1e9; break
          case 0x23314f: timeScale = await float(reader, field); break
          case 0x6d80: encoded = true; break
        }
      }
      if (type === 17) tracks.push({ id: `mkv-${number}`, number, name, language, codec, duration, timeScale, supported: supported.test(codec) && !encoded })
    }
    if (tracks.length && item.id === 0x1f43b675) break
    // Unknown-size clusters require full traversal; normal metadata precedes them.
    if (item.unknown) break
  }
  const segmentStart = segment.data, segmentEnd = segment.end
  return { tracks, async extract(id: string, signal: AbortSignal, progress: (value: number) => void): Promise<Cue[]> {
    const track = tracks.find(item => item.id === id)
    if (!track?.supported) throw new Error('Unsupported subtitle track')
    const read = new RangeReader(file, signal), cues: Cue[] = []
    let lastProgress = -1
    function report(at: number) { const value = Math.floor(at / file.size * 100); if (value !== lastProgress) { progress(value); lastProgress = value } }
    async function readBlock(block: Element, clusterTime: number, duration: number) {
      const head = await read.bytes(block.data, Math.min(16, block.end - block.data))
      let width = 1, mask = 128
      while (width <= 8 && !(head[0] & mask)) { width++; mask >>= 1 }
      if (width > 8 || head.length < width + 3) throw new Error('Invalid subtitle block')
      let number = head[0] & (mask - 1)
      for (let i = 1; i < width; i++) number = number * 256 + head[i]
      if (number !== track!.number) return
      if (head[width + 2] & 6) throw new Error('Laced text subtitles are unsupported')
      let relative = head[width] * 256 + head[width + 1]
      if (relative >= 32768) relative -= 65536
      let text = await read.text(block.data + width + 3, block.end - block.data - width - 3)
      if (/\/(ASS|SSA)$/.test(track!.codec)) text = text.split(',').slice(8).join(',')
      if (/WEBVTT/.test(track!.codec)) { const lines = text.split('\n'); if (lines.length >= 3) text = lines.slice(2).join('\n') }
      text = cleanText(text)
      const start = Math.max(0, (clusterTime + relative * track!.timeScale) * scale / 1e9)
      if (text) cues.push({ id: `${id}-${cues.length}`, text, start, end: start + (duration > 0 ? duration * track!.timeScale * scale / 1e9 : track!.duration || 4) })
      if (cues.length > 200_000) throw new Error('Subtitle limit exceeded')
    }
    async function cluster(item: Element) {
      let clusterTime = 0, at = item.data
      while (at < item.end) {
        signal.throwIfAborted()
        const field = await ebml(read, at)
        if (item.unknown && topLevel.has(field.id)) return at
        if (field.end > item.end) throw new Error('Invalid cluster boundary')
        if (field.id === 0xe7) clusterTime = await read.uint(field.data, field.end - field.data)
        else if (field.id === 0xa3) await readBlock(field, clusterTime, 0)
        else if (field.id === 0xa0) {
          let block: Element | undefined, duration = 0
          for await (const entry of elements(read, field.data, field.end)) {
            if (entry.id === 0xa1) block = entry
            if (entry.id === 0x9b) duration = await read.uint(entry.data, entry.end - entry.data)
          }
          if (block) await readBlock(block, clusterTime, duration)
        }
        at = field.end; report(at)
      }
      return item.end
    }
    for (let at = segmentStart; at < segmentEnd;) {
      signal.throwIfAborted(); const item = await ebml(read, at)
      const next = item.id === 0x1f43b675 ? await cluster(item) : item.end
      if (next <= at) throw new Error('Invalid segment boundary')
      at = next; report(at)
    }
    progress(100)
    return cues.sort((a, b) => a.start - b.start)
  } }
}
