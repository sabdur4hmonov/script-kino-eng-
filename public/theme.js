;(() => {
  let theme
  try {
    theme = localStorage.getItem('kinotingla-theme')
  } catch {
    // Storage can be disabled by the browser.
  }
  if (theme !== 'dark' && theme !== 'light') {
    theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0c0b0f' : '#f4f0e8')
})()
