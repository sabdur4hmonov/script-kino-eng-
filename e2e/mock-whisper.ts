import { test as base } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, runWithPage) => {
    await page.addInitScript(() => {
      const native = window.Worker
      class MockWhisper extends EventTarget {
        postMessage(request: { id: number }) {
          setTimeout(
            () =>
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: { id: request.id, type: 'result', chunks: [], wordTimestamps: true },
                }),
              ),
            0,
          )
        }
        terminate() {}
      }
      window.Worker = new Proxy(native, {
        construct(target, [href, options]) {
          return String(href).includes('whisper.worker')
            ? new MockWhisper()
            : new target(href, options)
        },
      })
    })
    await runWithPage(page)
  },
})
export { expect } from '@playwright/test'
