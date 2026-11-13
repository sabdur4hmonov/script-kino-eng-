import { expect, test } from 'vitest'
import { mediaLink, requireRange } from '../src/lib/media-input'

test('only accepts direct HTTPS addresses and identifies platform links', () => {
  for (const host of [
    'www.youtube.com',
    'youtu.be',
    'instagram.com',
    'm.tiktok.com',
    't.me',
    'drive.google.com',
    'disk.yandex.ru',
  ]) {
    expect(mediaLink(`https://${host}/movie`)).toEqual({ error: 'page' })
  }
  expect(mediaLink('http://example.org/movie.mp4')).toEqual({ error: 'invalid' })
  expect(mediaLink('https://me:secret@example.org/movie.mp4')).toEqual({ error: 'invalid' })
  expect(mediaLink(' https://example.org/movie.mp4?key=x#t=3 ')).toEqual({
    url: new URL('https://example.org/movie.mp4?key=x'),
  })
})

test('rejects a full response without consuming its body and requires exposed range metadata', async () => {
  let canceled = false
  const response = new Response(
    new ReadableStream({
      cancel() {
        canceled = true
      },
    }),
  )
  await expect(requireRange(response)).rejects.toThrow()
  expect(canceled).toBe(true)
  await expect(requireRange(new Response('', { status: 206 }))).rejects.toThrow()
  await expect(
    requireRange(new Response('', { status: 206, headers: { 'Content-Range': 'bytes 0-0/4096' } })),
  ).resolves.toBeTruthy()
})
