import { useState } from 'react'
import { uz as t } from './i18n/uz'

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')

  function toggle() {
    const theme = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
    setDark(!dark)
    try {
      localStorage.setItem('kinotingla-theme', theme)
    } catch {
      // The theme still works for this visit when storage is unavailable.
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={t.themeToggle}
      aria-pressed={dark}
      onClick={toggle}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
          </>
        ) : (
          <path d="M20.7 15.4A9 9 0 0 1 8.6 3.3 9.1 9.1 0 1 0 20.7 15.4Z" />
        )}
      </svg>
    </button>
  )
}
