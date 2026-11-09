import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
const media = (name: string) => resolve('test-media', name)

test('unsupported audio has an Uzbek warning; revealed answers are unscored and words speak', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaCapabilities', {
      configurable: true,
      value: {
        decodingInfo: async () => ({ supported: false, smooth: false, powerEfficient: false }),
      },
    })
    Object.defineProperty(window.speechSynthesis, 'speak', {
      configurable: true,
      value: (utterance: SpeechSynthesisUtterance) => {
        ;(window as unknown as { spoken: { text: string; lang: string } }).spoken = {
          text: utterance.text,
          lang: utterance.lang,
        }
      },
    })
  })
  await page.goto('/')
  await page.getByLabel('Video tanlang', { exact: true }).setInputFiles(media('sample-ac3.mkv'))
  await expect(page.locator('.notice.warning')).toContainText(
    'audio kodekini brauzeringiz qo‘llamasligi mumkin',
  )
  const audioHelp = page.getByRole('button', { name: 'Qanday tuzataman?', exact: true })
  await audioHelp.click()
  const guide = page.getByRole('dialog', { name: 'AC3 yoki DTS ovozini AAC’ga o‘tkazish' })
  await expect(guide).toContainText('HandBrake')
  await expect(guide.locator('code')).toHaveText(
    'ffmpeg -i input.mkv -map 0 -c:v copy -c:s copy -c:a aac -b:a 192k output.mkv',
  )
  await expect(guide).toContainText('subtitrlar o‘z holicha saqlanadi')
  await guide.getByRole('button', { name: 'Yopish' }).click()
  await expect(audioHelp).toBeFocused()
  await page.getByRole('button', { name: 'Subtitrlarni olish', exact: true }).click()
  await page.getByRole('button', { name: 'Javobni ko‘rsatish', exact: true }).click()
  await page.locator('.answer-words button').first().click()
  await page.getByRole('button', { name: 'Talaffuz', exact: true }).click()
  expect(
    await page.evaluate(
      () => (window as unknown as { spoken: { text: string; lang: string } }).spoken,
    ),
  ).toEqual({ text: "Don't", lang: 'en-US' })
  await expect(page.locator('.stats-meta b').first()).toHaveText('0')
  await page.getByRole('button', { name: 'Keyingi jumla', exact: true }).click()
  await expect(page.locator('.line-count')).toContainText('2 / 3')
})

test('an unfinished answer resumes and storage failure leaves practice usable', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByLabel('Video tanlang', { exact: true }).setInputFiles(media('sample.mp4'))
  await expect(page.locator('.upload-subtitle')).toBeEnabled()
  await page.getByLabel('SRT / VTT qo‘shish', { exact: true }).setInputFiles(media('sample.srt'))
  const input = page.getByRole('textbox', { name: 'Eshitganingizni inglizcha yozing' })
  await input.pressSequentially('do not forget', { delay: 25 })
  await input.blur()
  await expect(page.getByText('Shu brauzerda saqlandi', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByLabel('Video tanlang', { exact: true }).setInputFiles(media('sample.mp4'))
  await expect(input).toHaveValue('do not forget')
  const another = await context.newPage()
  await another.addInitScript(() =>
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: {
        open() {
          throw new Error('Storage unavailable')
        },
      },
    }),
  )
  await another.goto('/')
  await another.getByLabel('Video tanlang', { exact: true }).setInputFiles(media('sample.mp4'))
  await expect(another.getByRole('alert')).toContainText('Brauzer xotirasiga saqlab bo‘lmadi')
  await another.getByLabel('SRT / VTT qo‘shish', { exact: true }).setInputFiles(media('sample.vtt'))
  await expect(
    another.getByRole('textbox', { name: 'Eshitganingizni inglizcha yozing' }),
  ).toBeEditable()
})
