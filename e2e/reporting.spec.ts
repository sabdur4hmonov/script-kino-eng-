import { expect, test } from '@playwright/test'
import { FEEDBACK_URL } from '../src/config'
import { uz as t } from '../src/i18n/uz'

test('error reports copy only safe diagnostics and open feedback', async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text: string) => sessionStorage.setItem('copied-report', text) },
    })
  })
  await context.route(FEEDBACK_URL, route => route.fulfill({ body: 'Feedback' }))
  await page.goto('/')
  await page.evaluate(() => {
    const error = new TypeError('private-film.mkv: my private subtitle')
    error.stack = [
      'TypeError: private-film.mkv: my private subtitle',
      '  at secret subtitle (' + location.origin + '/src/App.tsx?private-film.mkv:12:34)',
      '  at privateFrame (' + location.origin + '/private-film.mkv:1:2)',
    ].join('\n')
    window.dispatchEvent(new ErrorEvent('error', { error }))
  })
  const feedback = page.getByRole('link', { name: t.reportError })
  await expect(feedback).toHaveAttribute('rel', 'noopener noreferrer')
  const newTab = context.waitForEvent('page')
  await feedback.click()
  await expect(await newTab).toHaveURL(FEEDBACK_URL)
  await expect(page.getByText(t.diagnosticPaste)).toBeVisible()
  const report = await page.evaluate(() => sessionStorage.getItem('copied-report'))
  expect(report).toContain(t.diagnosticTitle)
  expect(report).toContain(t.diagnosticBrowser)
  expect(report).toContain(t.diagnosticWebGpu)
  expect(report).toContain(t.diagnosticRedacted)
  expect(report).toContain('src/App.tsx:12:34')
  expect(report).not.toMatch(/private-film|private subtitle|secret subtitle/)
  await expect(page.getByRole('heading', { name: new RegExp(t.title) })).toBeVisible()
})

test('a rejected promise can be reported even when clipboard access fails', async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => { throw new Error('Permission denied') } },
    })
  })
  await context.route(FEEDBACK_URL, route => route.fulfill({ body: 'Feedback' }))
  await page.goto('/')
  await page.evaluate(() => {
    const promise = Promise.resolve()
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise, reason: 'Private caption' }))
  })
  await page.getByRole('link', { name: t.reportError }).click()
  await expect(page.getByText(t.diagnosticManual)).toBeVisible()
  const report = page.getByRole('textbox', { name: t.diagnosticTitle })
  await expect(report).toHaveValue(new RegExp(t.diagnosticSources.promise))
  await expect(report).not.toHaveValue(/Private caption/)
})

test('the error boundary keeps the theme switch available and can retry', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 1 })
    const match = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      if (query === '(pointer: coarse)' && !sessionStorage.getItem('allow-app-render')) {
        throw new Error('Temporary render failure')
      }
      return match(query)
    }
  })
  await page.goto('/')
  await expect(page.getByText(t.unexpectedError)).toBeVisible()
  const theme = page.getByRole('button', { name: t.themeToggle })
  const originalTheme = await theme.getAttribute('aria-pressed')
  await theme.click()
  await expect(theme).toHaveAttribute('aria-pressed', originalTheme === 'true' ? 'false' : 'true')
  await page.evaluate(() => sessionStorage.setItem('allow-app-render', 'yes'))
  await page.getByRole('button', { name: t.aiRetry }).click()
  await expect(page.getByRole('heading', { name: new RegExp(t.title) })).toBeVisible()
  await expect(page.getByText(t.unexpectedError)).toHaveCount(0)
})

test('a worker failure reports the audio format and size bucket without the file name', async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text: string) => sessionStorage.setItem('copied-report', text) },
    })
    const Native = window.Worker
    class FailingWorker extends EventTarget {
      postMessage() {
        setTimeout(() => this.dispatchEvent(new ErrorEvent('error', {
          error: new Error('private-episode.mp4'),
          cancelable: true,
        })), 0)
      }
      terminate() {}
    }
    window.Worker = new Proxy(Native, {
      construct(target, [href, options]) {
        return String(href).includes('whisper.worker') ? new FailingWorker() : new target(href, options)
      },
    })
  })
  await context.route(FEEDBACK_URL, route => route.fulfill({ body: 'Feedback' }))
  await page.goto('/')
  await page.getByLabel(t.chooseVideo, { exact: true }).setInputFiles('test-media/sample.mp4')
  await page.getByRole('link', { name: t.reportError }).click()
  const report = await page.evaluate(() => sessionStorage.getItem('copied-report'))
  expect(report).toContain(t.whisperWorkerError)
  expect(report).toContain('mp4, <10 MB')
  expect(report).toMatch(/Audio kodek: aac/i)
  expect(report).not.toMatch(/private-episode|sample\.mp4/)
})
