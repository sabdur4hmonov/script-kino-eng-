import { expect, test } from '@playwright/test'

function fixture(seconds: number) {
  const rate = 16000
  const pcm = Buffer.alloc(44 + seconds * rate * 2)
  pcm.write('RIFF', 0)
  pcm.writeUInt32LE(pcm.length - 8, 4)
  pcm.write('WAVEfmt ', 8)
  pcm.writeUInt32LE(16, 16)
  pcm.writeUInt16LE(1, 20)
  pcm.writeUInt16LE(1, 22)
  pcm.writeUInt32LE(rate, 24)
  pcm.writeUInt32LE(rate * 2, 28)
  pcm.writeUInt16LE(2, 32)
  pcm.writeUInt16LE(16, 34)
  pcm.write('data', 36)
  pcm.writeUInt32LE(pcm.length - 44, 40)
  for (let i = 44; i < pcm.length; i += 2) pcm.writeInt16LE(i % 12 ? 3000 : -3000, i)
  return pcm
}

test('practices from the first audio window, filters noise, corrects scores and resumes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const globals = window as typeof window & { whisperCalls: number; releaseWhisper?: () => void }
    globals.whisperCalls = 0
    const Native = window.Worker
    class Mock extends EventTarget {
      postMessage({ id }: { id: number }) {
        const call = ++globals.whisperCalls
        const send = () =>
          this.dispatchEvent(
            new MessageEvent('message', {
              data: {
                id,
                type: 'result',
                wordTimestamps: true,
                chunks:
                  call === 1
                    ? [
                        { text: 'The', start: 0.2, end: 0.4 },
                        { text: 'green', start: 0.4, end: 0.6, confidence: 0.25 },
                        { text: 'train', start: 0.6, end: 0.8 },
                        { text: 'arrived.', start: 0.8, end: 1.2 },
                        { text: 'Thank you for watching.', start: 2, end: 3 },
                      ]
                    : [{ text: 'I saw Rachel yesterday.', start: 1, end: 2 }],
              },
            }),
          )
        if (call === 2) globals.releaseWhisper = send
        else setTimeout(send, 0)
      }
      terminate() {}
    }
    window.Worker = new Proxy(Native, {
      construct(target, [href, options]) {
        return String(href).includes('whisper.worker') ? new Mock() : new target(href, options)
      },
    })
  })
  const media = { name: 'automatic.wav', mimeType: 'audio/wav', buffer: fixture(36) }
  await page.goto('/')
  await page.getByLabel('Video tanlang', { exact: true }).setInputFiles(media)
  const input = page.getByRole('textbox', { name: 'Eshitganingizni inglizcha yozing' })
  await expect(input).toBeEditable()
  await expect(page.locator('audio[aria-label="Ovoz fayli"]')).toBeVisible()
  await expect(page.locator('.line-count')).toContainText('1 / 1')
  await expect(page.locator('.ai-status')).toContainText('00:30 / 00:36')
  await page.getByRole('button', { name: 'Qayta tinglash', exact: true }).click()
  await expect
    .poll(() => page.locator('audio').evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0)
  await input.fill('The blue train arvied now')
  await page.getByRole('button', { name: 'Tekshirish', exact: true }).click()
  await expect(page.locator('.diff-disputed')).toHaveCount(2)
  await expect(page.locator('.diff-spelling')).toHaveText('arvied')
  await expect(page.locator('.mistakes-panel:not(.spelling-panel)')).not.toContainText('green')
  await page.getByRole('button', { name: "Men to'g'ri yozdim", exact: true }).click()
  await expect(page.locator('.answer-heading b')).toHaveText('100%')
  await expect(page.locator('.spelling-panel')).toHaveCount(0)
  await page.getByRole('button', { name: 'Bekor qilish', exact: true }).click()
  await expect(page.locator('.diff-spelling')).toHaveCount(1)
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof (window as unknown as { releaseWhisper?: () => void }).releaseWhisper,
      ),
    )
    .toBe('function')
  await page.evaluate(() => (window as unknown as { releaseWhisper: () => void }).releaseWhisper())
  await expect(page.locator('.ai-status')).toContainText('00:36 / 00:36')
  await page.getByRole('button', { name: 'Keyingi jumla', exact: true }).click()
  await expect(page.locator('.line-count')).toContainText('2 / 2')
  await input.fill('I saw Rachell yesterday')
  await page.getByRole('button', { name: 'Tekshirish', exact: true }).click()
  await expect(page.locator('.answer-heading b')).toHaveText('100%')
  await expect(page.getByText('Shu brauzerda saqlandi', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByLabel('Video tanlang', { exact: true }).setInputFiles(media)
  await expect(page.locator('.ai-status')).toContainText('00:36 / 00:36')
  await expect(page.locator('.line-count')).toContainText('2 / 2')
  expect(
    await page.evaluate(() => (window as unknown as { whisperCalls: number }).whisperCalls),
  ).toBe(0)
})

test('accepts ranged direct media and explains CORS, full responses and platform pages', async ({
  page,
}) => {
  const data = fixture(2)
  const ranges: string[] = []
  await page.context().route('https://fixtures.example/**', async (route) => {
    const request = route.request()
    const headers: Record<string, string> = { 'content-type': 'audio/wav' }
    if (!request.url().includes('/blocked')) {
      headers['access-control-allow-origin'] = '*'
      headers['access-control-expose-headers'] = 'Content-Range'
    }
    const raw = request.headers().range ?? ''
    ranges.push(raw)
    const valid = /^bytes=(\d+)-(\d*)$/.exec(raw)
    if (!valid || request.url().includes('/full'))
      return route.fulfill({ status: 200, headers, body: data })
    const start = Number(valid[1]),
      end = valid[2] ? Math.min(data.length - 1, Number(valid[2])) : data.length - 1
    headers['content-range'] = `bytes ${start}-${end}/${data.length}`
    await route.fulfill({ status: 206, headers, body: data.subarray(start, end + 1) })
  })
  // Serve silence for this test so the direct-link flow needs no model download.
  data.fill(0, 44)
  await page.goto('/')
  const link = page.getByLabel('Havola qo‘yish', { exact: true })
  const open = page.getByRole('button', { name: 'Havolani ochish' })
  await link.fill('https://youtu.be/test')
  await open.click()
  await expect(page.getByRole('alert')).toContainText('Bu platforma havolasi bevosita ochilmaydi')
  expect(ranges).toEqual([])
  for (const name of ['blocked', 'full']) {
    await link.fill('https://fixtures.example/' + name + '.wav')
    await open.click()
    await expect(page.getByRole('alert')).toContainText('Bu sayt faylni berishga ruxsat bermadi')
    await expect(page.locator('audio')).toHaveCount(0)
  }
  await link.fill('https://fixtures.example/good.wav')
  await open.click()
  await expect(page.locator('audio')).toHaveAttribute('src', 'https://fixtures.example/good.wav')
  expect(ranges.filter((range) => range === 'bytes=0-0')).toHaveLength(3)
})
