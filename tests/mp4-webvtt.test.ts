import { expect, it } from 'vitest'
import { inspectMp4 } from '../src/lib/embedded-mp4'

function u32(value: number) {
  const bytes = Buffer.alloc(4)
  bytes.writeUInt32BE(value >>> 0)
  return bytes
}
const atom = (type: string, ...data: Buffer[]) => {
  const body = Buffer.concat(data)
  return Buffer.concat([u32(body.length + 8), Buffer.from(type), body])
}
const full = (type: string, ...data: Buffer[]) => atom(type, u32(0), ...data)

it('reads MP4 WebVTT with co64 offsets, signed composition time and an empty edit', async () => {
  const sample = atom('vttc', atom('payl', Buffer.from('Hello\n<i>world</i>')))
  function movie(offset: number) {
    const chunkOffset = Buffer.alloc(8)
    chunkOffset.writeBigUInt64BE(BigInt(offset))
    const stbl = atom(
      'stbl',
      full('stsd', u32(1), atom('wvtt')),
      full('stsz', u32(0), u32(1), u32(sample.length)),
      full('stts', u32(1), u32(1), u32(2000)),
      atom('ctts', u32(0x01000000), u32(1), u32(1), u32(-100)),
      full('stsc', u32(1), u32(1), u32(1), u32(1)),
      full('co64', u32(1), chunkOffset),
    )
    const language = Buffer.from([0x15, 0xc7]) // ISO 639: eng
    return atom(
      'moov',
      full('mvhd', u32(0), u32(0), u32(1000), u32(3000)),
      atom(
        'trak',
        full('tkhd', u32(0), u32(0), u32(1)),
        atom(
          'edts',
          full('elst', u32(2), u32(1000), u32(-1), u32(0x10000), u32(2000), u32(500), u32(0x10000)),
        ),
        atom(
          'mdia',
          full('mdhd', u32(0), u32(0), u32(1000), u32(2000), language, Buffer.alloc(2)),
          full('hdlr', u32(0), Buffer.from('subt')),
          atom('minf', stbl),
        ),
      ),
    )
  }
  const placeholder = movie(0),
    data = Buffer.concat([movie(placeholder.length + 8), atom('mdat', sample)])
  const parsed = await inspectMp4(new Blob([data]))
  expect(parsed.tracks[0].language).toBe('eng')
  const cues = await parsed.extract('mp4-1', new AbortController().signal, () => {})
  expect(cues).toEqual([{ id: 'mp4-1-0', start: 0.4, end: 2.4, text: 'Hello world' }])
})
