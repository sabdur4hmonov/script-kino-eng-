/** Bounded random access. A movie's audio/video payload is skipped, never buffered. */
export class RangeReader {
  private cache = new Uint8Array(0)
  private cacheAt = 0
  readonly file: Blob
  readonly signal?: AbortSignal
  constructor(file: Blob, signal?: AbortSignal) { this.file = file; this.signal = signal }
  async bytes(at: number, length: number): Promise<Uint8Array> {
    this.signal?.throwIfAborted()
    if (!Number.isSafeInteger(at) || at < 0 || length < 0 || at + length > this.file.size || length > 8 * 1024 * 1024) throw new Error('Invalid media range')
    if (at >= this.cacheAt && at + length <= this.cacheAt + this.cache.length) return this.cache.subarray(at - this.cacheAt, at - this.cacheAt + length)
    this.cacheAt = at
    this.cache = new Uint8Array(await this.file.slice(at, Math.min(this.file.size, at + Math.max(length, 256 * 1024))).arrayBuffer())
    this.signal?.throwIfAborted()
    return this.cache.subarray(0, length)
  }
  async uint(at: number, length: number) {
    const bytes = await this.bytes(at, length)
    const value = bytes.reduce((sum, byte) => sum * 256 + byte, 0)
    if (!Number.isSafeInteger(value)) throw new Error('Unsafe media integer')
    return value
  }
  async text(at: number, length: number) { return new TextDecoder().decode(await this.bytes(at, length)).replace(/\0+$/, '') }
}

export type Element = { id: number; data: number; end: number; unknown: boolean }
export async function ebml(reader: RangeReader, at: number): Promise<Element> {
  const bytes = await reader.bytes(at, Math.min(16, reader.file.size - at))
  function vint(offset: number, keepMarker: boolean) {
    const first = bytes[offset]; let width = 1, mask = 128
    while (width <= 8 && !(first & mask)) { mask >>= 1; width++ }
    if (width > 8 || offset + width > bytes.length) throw new Error('Invalid EBML')
    let value = keepMarker ? first : first & (mask - 1)
    let unknown = !keepMarker && value === mask - 1
    for (let i = 1; i < width; i++) { value = value * 256 + bytes[offset + i]; unknown = unknown && bytes[offset + i] === 255 }
    return { value, width, unknown }
  }
  const id = vint(0, true), size = vint(id.width, false)
  const data = at + id.width + size.width
  if (!size.unknown && (!Number.isSafeInteger(size.value) || data + size.value > reader.file.size)) throw new Error('Truncated EBML')
  return { id: id.value, data, end: size.unknown ? reader.file.size : data + size.value, unknown: size.unknown }
}
export async function* elements(reader: RangeReader, from: number, to: number) {
  for (let at = from; at < to;) {
    const item = await ebml(reader, at)
    if (item.end > to || item.end <= at) throw new Error('Invalid EBML boundary')
    yield item
    at = item.end
  }
}
export type Box = { type: string; data: number; end: number }
export async function* boxes(reader: RangeReader, from: number, to: number): AsyncGenerator<Box> {
  for (let at = from; at + 8 <= to;) {
    let size = await reader.uint(at, 4)
    const type = await reader.text(at + 4, 4)
    let header = 8
    if (size === 1) { size = await reader.uint(at + 8, 8); header = 16 }
    else if (size === 0) size = to - at
    if (size < header || at + size > to) throw new Error('Invalid MP4 box')
    yield { type, data: at + header, end: at + size }
    at += size
  }
}
export async function child(reader: RangeReader, parent: Box, type: string) {
  for await (const box of boxes(reader, parent.data, parent.end)) if (box.type === type) return box
  return undefined
}
