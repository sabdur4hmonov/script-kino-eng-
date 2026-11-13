import { test, expect } from './mock-whisper'
import { resolve } from 'node:path'
const media = (name: string) => resolve('test-media', name)

test('local import, hotkeys, clipping, scoring, editing and resume', async ({ page }, info) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173'))
      externalRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sevimli kinongiz —' })).toBeVisible()
  await page.screenshot({ path: `test-results/${info.project.name}-empty.png`, fullPage: true })
  await page.getByLabel('Video tanlang', { exact: true }).setInputFiles(media('sample.mp4'))
  await expect(page.getByRole('button', { name: 'SRT / VTT qo‘shish', exact: true })).toBeEnabled()
  await page.getByLabel('SRT / VTT qo‘shish', { exact: true }).setInputFiles(media('sample.srt'))
  const input = page.getByRole('textbox', { name: 'Eshitganingizni inglizcha yozing' })
  await expect(input).toBeVisible()
  await expect(input).toHaveAttribute('autocorrect', 'off')
  await expect(input).toHaveAttribute('spellcheck', 'false')
  await page.locator('video').evaluate((video) => {
    const events: unknown[] = []
    ;(window as unknown as { mediaEvents: unknown[] }).mediaEvents = events
    for (const name of [
      'play',
      'playing',
      'pause',
      'seeking',
      'seeked',
      'loadedmetadata',
      'error',
      'ended',
    ])
      video.addEventListener(name, () =>
        events.push({
          name,
          time: video.currentTime,
          paused: video.paused,
          state: video.readyState,
        }),
      )
  })
  await input.focus()
  await page.keyboard.press('Control+Space')
  await expect
    .poll(() => page.locator('video').evaluate((video) => video.currentTime))
    .toBeGreaterThan(0.5)
  try {
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.paused), { timeout: 6000 })
      .toBe(true)
  } catch (error) {
    console.log(
      await page.evaluate(() => (window as unknown as { mediaEvents: unknown[] }).mediaEvents),
    )
    console.log(
      await page.locator('video').evaluate((video) => ({
        time: video.currentTime,
        paused: video.paused,
        state: video.readyState,
        error: video.error?.message,
      })),
    )
    throw error
  }
  const pausedAt = await page.locator('video').evaluate((video) => video.currentTime)
  expect(pausedAt).toBeGreaterThanOrEqual(3.1)
  expect(pausedAt).toBeLessThan(3.5)
  await input.pressSequentially('do not forget your 20 tickets', { delay: 35 })
  await input.press('Enter')
  await expect(page.locator('.answer-heading b')).toHaveText('100%')
  await page.screenshot({ path: `test-results/${info.project.name}-checked.png`, fullPage: true })
  await input.press('Enter')
  await expect(page.locator('.line-count')).toContainText('2 / 3')
  await page.getByRole('button', { name: 'Keyinroq 0.5 s', exact: true }).click()
  await page.getByRole('button', { name: 'Matnni tahrirlash', exact: true }).click()
  await page
    .getByLabel('Subtitr matnini tuzatish', { exact: true })
    .fill('We are going home today.')
  await page.getByRole('button', { name: 'Saqlash', exact: true }).click()
  await input.pressSequentially('we going home tomorrow', { delay: 30 })
  await input.press('Enter')
  await expect(page.locator('.diff-wrong')).toHaveText('tomorrow')
  await expect(page.locator('.diff-missing')).toHaveText(['are', 'today'])
  await expect(page.getByText('Shu brauzerda saqlandi', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByLabel('Video tanlang', { exact: true }).setInputFiles(media('sample.mp4'))
  await expect(
    page.getByRole('status').filter({ hasText: 'Oldingi mashqingiz tiklandi.' }),
  ).toBeVisible()
  await expect(page.locator('.line-count')).toContainText('2 / 3')
  await expect(page.locator('.sync-heading b')).toHaveText('+0.5 s')
  await expect(page.locator('.answer-words')).toContainText('today.')
  await input.press('Enter')
  await expect(page.locator('.line-count')).toContainText('3 / 3')
  await page.getByRole('button', { name: /^O‘tkazib yuborish/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Ajoyib, mashq tugadi!', exact: true }),
  ).toBeVisible()
  for (const area of ['footer', '.finished']) {
    const feedback = page.locator(area).getByRole('link', { name: 'Fikr bildirish' })
    await expect(feedback).toHaveAttribute('href', 'https://t.me/REPLACE_ME')
    await expect(feedback).toHaveAttribute('target', '_blank')
    await expect(feedback).toHaveAttribute('rel', 'noopener noreferrer')
  }
  expect(externalRequests).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('English embedded track selection, WebVTT upload and Android input classification', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByLabel('Video tanlang', { exact: true }).setInputFiles(media('sample-srt.mkv'))
  const tracks = page.getByLabel('Video ichidagi subtitr', { exact: true })
  await expect(tracks).toHaveValue('mkv-4')
  await page.getByRole('button', { name: 'Subtitrlarni olish', exact: true }).click()
  await expect(page.locator('.line-count')).toContainText('1 / 3')
  await page.getByLabel('SRT / VTT qo‘shish', { exact: true }).setInputFiles(media('sample.vtt'))
  const input = page.getByRole('textbox', { name: 'Eshitganingizni inglizcha yozing' })
  await input.dispatchEvent('keydown', {
    key: 'Unidentified',
    keyCode: 229,
    which: 229,
    bubbles: true,
  })
  await input.fill('incorrect answer')
  await page.getByRole('button', { name: 'Tekshirish', exact: true }).click()
  await expect(page.locator('.device-tabs button.selected')).toHaveText('Telefon')
  await expect(page.locator('.stats-meta b').first()).toHaveText('1')
  await page.getByRole('button', { name: 'Jismoniy klaviatura', exact: true }).click()
  await expect(page.locator('.stats-meta b').first()).toHaveText('0')
})
