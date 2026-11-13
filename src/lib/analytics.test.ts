import { afterEach, expect, it, vi } from 'vitest'
import { loadAnalytics } from './analytics'

afterEach(() => vi.unstubAllGlobals())

it('only inserts one production beacon and sends no application fields', () => {
  const scripts: Array<{ id: string; src: string; type: string; referrerPolicy: string; dataset: { cfBeacon: string } }> = []
  vi.stubGlobal('document', {
    getElementById: (id: string) => scripts.find(script => script.id === id),
    createElement: () => ({ dataset: {} }),
    head: { append: (script: (typeof scripts)[number]) => scripts.push(script) },
  })
  loadAnalytics(false, 'example-token')
  loadAnalytics(true, '  ')
  expect(scripts).toEqual([])
  loadAnalytics(true, 'example-token')
  loadAnalytics(true, 'another-token')
  expect(scripts).toHaveLength(1)
  expect(scripts[0].type).toBe('module')
  expect(scripts[0].src).toBe('https://static.cloudflareinsights.com/beacon.min.js')
  expect(JSON.parse(scripts[0].dataset.cfBeacon)).toEqual({ token: 'example-token', spa: false })
})
