import { expect, test } from '@playwright/test'

test('subtitle help opens from both entries, traps focus and restores it', async ({ page }) => {
  await page.goto('/')
  const header = page.getByRole('button', { name: 'Yordam', exact: true })
  const subtitle = page.getByRole('button', { name: 'Subtitr qayerdan olaman?', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Subtitr qayerdan olaman?' })
  for (const opener of [header, subtitle]) {
    await opener.click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Video ichidagi subtitr')
    await expect(dialog).toContainText('<kino nomi> english srt')
    await expect(dialog).toContainText('Audio to text (Whisper)')
    await expect(dialog).toContainText('Buzz')
    const close = dialog.getByRole('button', { name: 'Yopish' })
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  }
})
