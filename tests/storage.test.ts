import 'fake-indexeddb/auto'
import { expect, it } from 'vitest'
import { fingerprint, loadSession, saveSession } from '../src/lib/storage'
import type { Session } from '../src/types'

it('fingerprints only first/last 1 MiB and size, independently of filename', async () => {
  const a = new File(['same data'], 'first.mp4'),
    b = new File(['same data'], 'renamed.mkv')
  expect(await fingerprint(a)).toBe(await fingerprint(b))
  expect(await fingerprint(new File(['changed'], 'first.mp4'))).not.toBe(await fingerprint(a))
})
it('fingerprints a 2 GB file through exactly two 1 MiB reads', async () => {
  const ranges: [number, number][] = [],
    size = 2 * 1024 ** 3
  const file = {
    size,
    slice(start: number, end = size) {
      ranges.push([start, end])
      return new Blob([new Uint8Array(end - start)])
    },
  } as File
  expect(await fingerprint(file)).toMatch(/^2147483648:[a-f0-9]{64}$/)
  expect(ranges).toEqual([
    [0, 1024 ** 2],
    [size - 1024 ** 2, size],
  ])
})
it('restores edits, offset, draft, device stats and progress; keeps files separate', async () => {
  const session: Session = {
    fingerprint: 'test-key',
    cues: [{ id: 'one', start: 1, end: 2, text: 'hello' }],
    source: 'test.srt',
    index: 0,
    offset: 0.5,
    completed: false,
    edits: { one: 'hello world' },
    attempts: [{ cueId: 'one', correct: 1, total: 2, chars: 5, ms: 1000, device: 'phone', at: 1 }],
    mistakes: { world: 1 },
    work: {
      cueId: 'one',
      answer: 'hello',
      ms: 1000,
      device: 'phone',
      checked: false,
      revealed: false,
    },
  }
  await saveSession(session)
  expect(await loadSession('test-key')).toEqual(session)
  await Promise.all([
    saveSession({ ...session, offset: 1 }),
    saveSession({ ...session, offset: 2 }),
  ])
  expect((await loadSession('test-key'))?.offset).toBe(2)
  expect(await loadSession('another-file')).toBeUndefined()
})
