import type { MediaBytes } from './range-reader'
import type { Cue, Track } from '../types'
import { cleanText } from './subtitles'
import { RangeReader, boxes, child } from './range-reader'
import type { Box } from './range-reader'
type Mp4Track = Track & { table: Box; timescale: number; timeOffset: number }
const MAX_SAMPLES = 200_000

export async function inspectMp4(file: MediaBytes) {
  const reader = new RangeReader(file),
    tracks: Mp4Track[] = []
  let moov: Box | undefined,
    fragmented = false,
    movieScale = 1000
  for await (const box of boxes(reader, 0, file.size))
    if (box.type === 'moov') {
      moov = box
      break
    }
  if (!moov) throw new Error('Missing MP4 movie metadata')
  const mvhd = await child(reader, moov, 'mvhd')
  if (mvhd)
    movieScale = await reader.uint(
      mvhd.data + ((await reader.uint(mvhd.data, 1)) === 1 ? 20 : 12),
      4,
    )
  fragmented = !!(await child(reader, moov, 'mvex'))
  for await (const trak of boxes(reader, moov.data, moov.end)) {
    if (trak.type !== 'trak') continue
    const mdia = await child(reader, trak, 'mdia')
    if (!mdia) continue
    const hdlr = await child(reader, mdia, 'hdlr')
    if (!hdlr) continue
    const handler = await reader.text(hdlr.data + 8, 4)
    if (!['subt', 'text', 'sbtl', 'clcp'].includes(handler)) continue
    const mdhd = await child(reader, mdia, 'mdhd'),
      minf = await child(reader, mdia, 'minf'),
      tkhd = await child(reader, trak, 'tkhd')
    if (!mdhd || !minf || !tkhd) continue
    const version = await reader.uint(mdhd.data, 1)
    const timescale = await reader.uint(mdhd.data + (version === 1 ? 20 : 12), 4)
    const packedLanguage = await reader.uint(mdhd.data + (version === 1 ? 32 : 20), 2)
    const language = [10, 5, 0]
      .map((shift) => String.fromCharCode(((packedLanguage >> shift) & 31) + 96))
      .join('')
    const trackId = await reader.uint(
      tkhd.data + ((await reader.uint(tkhd.data, 1)) === 1 ? 20 : 12),
      4,
    )
    const table = await child(reader, minf, 'stbl')
    if (!table) continue
    const stsd = await child(reader, table, 'stsd')
    if (!stsd) continue
    const codec = await reader.text(stsd.data + 12, 4)
    let timeOffset = 0,
      editSupported = true
    const edts = await child(reader, trak, 'edts'),
      elst = edts && (await child(reader, edts, 'elst'))
    if (elst) {
      const wide = (await reader.uint(elst.data, 1)) === 1,
        count = await reader.uint(elst.data + 4, 4)
      let emptySeconds = 0,
        mediaFound = false
      if (count > 2) editSupported = false
      for (let i = 0; i < Math.min(count, 2); i++) {
        const at = elst.data + 8 + i * (wide ? 20 : 12),
          width = wide ? 8 : 4
        const duration = await reader.uint(at, width)
        const raw = await reader.bytes(at + width, width)
        const empty = raw.every((value) => value === 255)
        if (empty) emptySeconds += duration / movieScale
        else {
          if (raw[0] & 128 || mediaFound) editSupported = false
          else timeOffset = emptySeconds - (await reader.uint(at + width, width)) / timescale
          mediaFound = true
        }
        const rate = await reader.uint(at + width * 2, 4)
        if (rate !== 0x00010000) editSupported = false
      }
    }
    tracks.push({
      id: `mp4-${trackId}`,
      name: '',
      language: language === '```' ? 'und' : language,
      codec,
      table,
      timescale,
      timeOffset,
      supported:
        !fragmented &&
        editSupported &&
        timescale > 0 &&
        ['tx3g', 'text', 'wvtt', 'srt ', 'ass ', 'ssa '].includes(codec),
    })
  }
  return {
    tracks,
    async extract(
      id: string,
      signal: AbortSignal,
      progress: (value: number) => void,
    ): Promise<Cue[]> {
      const track = tracks.find((item) => item.id === id)
      if (!track?.supported) throw new Error('Unsupported MP4 subtitle track')
      const read = new RangeReader(file, signal),
        table = track.table
      const stsz = await child(read, table, 'stsz'),
        stts = await child(read, table, 'stts'),
        stsc = await child(read, table, 'stsc')
      const stco = (await child(read, table, 'stco')) ?? (await child(read, table, 'co64'))
      const ctts = await child(read, table, 'ctts')
      if (!stsz || !stts || !stsc || !stco) throw new Error('Incomplete subtitle sample tables')
      const count = await read.uint(stsz.data + 8, 4),
        fixedSize = await read.uint(stsz.data + 4, 4)
      if (count > MAX_SAMPLES) throw new Error('Subtitle limit exceeded')
      const sizes = new Uint32Array(count),
        durations = new Uint32Array(count),
        compositions = new Int32Array(count)
      for (let i = 0; i < count; i++)
        sizes[i] = fixedSize || (await read.uint(stsz.data + 12 + i * 4, 4))
      async function expandRuns(box: Box, output: Uint32Array | Int32Array, signed = false) {
        const entries = await read.uint(box.data + 4, 4)
        let index = 0
        if (entries > MAX_SAMPLES) throw new Error('Invalid time table')
        for (let i = 0; i < entries; i++) {
          const run = await read.uint(box.data + 8 + i * 8, 4)
          let value = await read.uint(box.data + 12 + i * 8, 4)
          if (signed && value >= 0x80000000) value -= 0x100000000
          if (index + run > count) throw new Error('Invalid sample run')
          output.fill(value, index, index + run)
          index += run
        }
        if (index !== count) throw new Error('Incomplete sample timing')
      }
      await expandRuns(stts, durations)
      if (ctts) await expandRuns(ctts, compositions, (await read.uint(ctts.data, 1)) === 1)
      const chunkCount = await read.uint(stco.data + 4, 4),
        mappingCount = await read.uint(stsc.data + 4, 4)
      if (chunkCount > MAX_SAMPLES || mappingCount > MAX_SAMPLES)
        throw new Error('Chunk limit exceeded')
      const mappings: { first: number; count: number }[] = []
      for (let i = 0; i < mappingCount; i++)
        mappings.push({
          first: await read.uint(stsc.data + 8 + i * 12, 4),
          count: await read.uint(stsc.data + 12 + i * 12, 4),
        })
      const cues: Cue[] = []
      let sample = 0,
        mapping = 0,
        time = 0
      for (let chunk = 1; chunk <= chunkCount; chunk++) {
        signal.throwIfAborted()
        while (mapping + 1 < mappings.length && mappings[mapping + 1].first <= chunk) mapping++
        if (!mappings[mapping] || mappings[mapping].count > count)
          throw new Error('Invalid sample mapping')
        const width = stco.type === 'co64' ? 8 : 4
        let at = await read.uint(stco.data + 8 + (chunk - 1) * width, width)
        for (let k = 0; k < mappings[mapping].count && sample < count; k++, sample++) {
          const size = sizes[sample],
            start = (time + compositions[sample]) / track.timescale + track.timeOffset
          let text = ''
          if (size) {
            if (track.codec === 'wvtt') {
              for await (const box of boxes(read, at, at + size))
                if (box.type === 'vttc') {
                  const payl = await child(read, box, 'payl')
                  if (payl) text += `${await read.text(payl.data, payl.end - payl.data)} `
                }
            } else if (track.codec === 'tx3g' || track.codec === 'text') {
              if (size < 2) throw new Error('Invalid timed text sample')
              const length = await read.uint(at, 2)
              if (length > size - 2) throw new Error('Invalid text length')
              const bytes = await read.bytes(at + 2, length)
              const encoding =
                bytes[0] === 254 && bytes[1] === 255
                  ? 'utf-16be'
                  : bytes[0] === 255 && bytes[1] === 254
                    ? 'utf-16le'
                    : 'utf-8'
              text = new TextDecoder(encoding).decode(bytes)
            } else text = await read.text(at, size)
            text = cleanText(text)
            if (text && durations[sample] > 0 && start + durations[sample] / track.timescale > 0)
              cues.push({
                id: `${id}-${sample}`,
                start: Math.max(0, start),
                end: start + durations[sample] / track.timescale,
                text,
              })
          }
          at += size
          time += durations[sample]
        }
        progress(Math.floor((chunk / chunkCount) * 100))
      }
      if (sample !== count) throw new Error('Incomplete subtitle samples')
      progress(100)
      return cues.sort((a, b) => a.start - b.start)
    },
  }
}
