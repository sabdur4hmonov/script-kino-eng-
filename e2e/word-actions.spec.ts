import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

test('word popovers offer translation from answers and mistakes without background requests', async ({
  page,
}) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173/'))
      externalRequests.push(request.url())
  })
  await page.goto('/')
  await page
    .getByLabel('Video tanlang', { exact: true })
    .setInputFiles(resolve('test-media', 'sample.mp4'))
  await expect(page.locator('.upload-subtitle')).toBeEnabled()
  await page.getByLabel('SRT / VTT qo‘shish', { exact: true }).setInputFiles({
    name: 'words.srt',
    mimeType: 'application/x-subrip',
    buffer: Buffer.from('1\n00:00:01,000 --> 00:00:03,000\n“Don’t!” wait.\n'),
  })
  await page.getByRole('textbox', { name: 'Eshitganingizni inglizcha yozing' }).fill('wait')
  await page.getByRole('button', { name: 'Tekshirish', exact: true }).click()
  await page.getByRole('button', { name: '“Don’t!”', exact: true }).click()
  const translation = page.getByRole('link', { name: 'Tarjima', exact: true })
  await expect(translation).toHaveAttribute(
    'href',
    'https://translate.google.com/?sl=en&tl=uz&text=Dont&op=translate',
  )
  await expect(translation).toHaveAttribute('target', '_blank')
  await expect(translation).toHaveAttribute('rel', 'noopener noreferrer')
  await page.keyboard.press('Escape')
  await expect(translation).toBeHidden()
  await page.locator('.mistake-words').getByRole('button', { name: /^not/ }).click()
  await expect(translation).toHaveAttribute(
    'href',
    'https://translate.google.com/?sl=en&tl=uz&text=not&op=translate',
  )
  expect(externalRequests).toEqual([])
})
