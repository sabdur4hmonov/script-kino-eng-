import { readFile, readdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { uz as t } from '../src/i18n/uz.ts'

const root = new URL('../', import.meta.url)
const publicFile = (name) => new URL('public/' + name, root)
const escape = (value) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

async function font(packageName, pattern) {
  const directory = new URL(`node_modules/${packageName}/files/`, root)
  const file = (await readdir(directory)).find((name) => pattern.test(name))
  if (!file) throw new Error('Missing bundled font from ' + packageName)
  return 'data:font/woff2;base64,' + (await readFile(new URL(file, directory))).toString('base64')
}
const [serif, italic, sans, mono, logo, grain] = await Promise.all([
  font('@fontsource/instrument-serif', /^instrument-serif-latin-400-normal\.woff2$/),
  font('@fontsource/instrument-serif', /^instrument-serif-latin-400-italic\.woff2$/),
  font('@fontsource-variable/inter', /^inter-latin-wght-normal\.woff2$/),
  font('@fontsource-variable/jetbrains-mono', /^jetbrains-mono-latin-wght-normal\.woff2$/),
  readFile(publicFile('favicon.svg'), 'utf8'),
  readFile(publicFile('grain.svg')),
])
const html = `<!doctype html><html lang="uz"><meta charset="utf-8"><style>
  @font-face{font-family:Serif;src:url('${serif}')} @font-face{font-family:Serif;src:url('${italic}');font-style:italic}
  @font-face{font-family:Inter;src:url('${sans}');font-weight:100 900} @font-face{font-family:Mono;src:url('${mono}')}
  *{box-sizing:border-box} body{margin:0;width:1200px;height:630px;color:#f4efe6;background:radial-gradient(ellipse at 85% 14%,#392619,#0c0b0f 61%);font:20px Inter,sans-serif;padding:57px 76px}
  body::after{content:'';position:fixed;inset:0;background:url('data:image/svg+xml;base64,${grain.toString('base64')}');opacity:.08;pointer-events:none}
  header{display:flex;gap:14px;align-items:center;font-size:31px;font-weight:650;letter-spacing:-.06em}
  header svg{width:52px;height:52px} header strong{color:#ffb547}
  main{padding-top:61px} h1{margin:0;font:88px/.91 Serif,serif;letter-spacing:-.025em} h1 em{font-size:72px;color:#ffb547} p{max-width:570px;color:#b7adbf;line-height:1.5;margin:26px 0}
  .example{position:absolute;right:76px;bottom:66px;border:1px solid #433848;border-radius:19px;padding:17px 20px;background:#1c1a22;transform:rotate(-4deg);box-shadow:0 18px 40px #0007}
  .label{display:flex;gap:30px;justify-content:space-between;align-items:center;font-size:15px;font-weight:650;margin-bottom:13px}
  .label b,.chips span{font:16px Mono,monospace;border-radius:7px;padding:6px 9px} .label b{color:#ffb547;background:#382a21}
  .chips{display:flex;gap:7px} .good{color:#5fe0a3;background:#20352c} .bad{color:#ff7a7a;background:#3c252c;text-decoration:line-through} .missing{color:#b7adbf;border:1px dashed #8f8899}
  .film{position:absolute;inset:auto 0 15px;height:8px;opacity:.3;background:repeating-linear-gradient(90deg,#8f8899 0 13px,transparent 13px 30px)}
</style><body>
<header>${logo}<span>${escape(t.brand)}<strong>${escape(t.brandAccent)}</strong></span></header>
<main><h1>${escape(t.title)}<br><em>${escape(t.titleAccent)}</em></h1><p>${escape(t.intro)}</p></main>
<div class="example"><div class="label">${escape(t.exampleResult)} <b>67%</b></div><div class="chips">
<span class="good">${escape(t.exampleWords[0])}</span><span class="bad">${escape(t.exampleWords[1])}</span><span class="missing">${escape(t.exampleWords[2])}</span>
</div></div><div class="film"></div></body></html>`

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  await writeFile(publicFile('og-image.png'), await page.screenshot())
  for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(`<style>body{margin:0;background:#ffb547}svg{display:block;width:100vw;height:100vh}</style>${logo}`)
    await writeFile(publicFile(name), await page.screenshot())
  }
} finally { await browser.close() }

await writeFile(publicFile('site.webmanifest'), JSON.stringify({
  id: '/', name: t.socialTitle, short_name: t.brand + t.brandAccent, description: t.socialDescription,
  lang: 'uz', start_url: '/', scope: '/', display: 'standalone', background_color: '#0c0b0f', theme_color: '#0c0b0f',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
  ],
}, null, 2) + '\n')
