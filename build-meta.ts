import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { uz as t } from './src/i18n/uz.ts'

const root = new URL('./', import.meta.url)
const defaultOrigin = 'https://kinotingla.pages.dev'

export function buildInfo() {
  const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as { version: string }
  let commit = process.env.CF_PAGES_COMMIT_SHA
  if (!commit) {
    try {
      commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: fileURLToPath(root), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    } catch {
      // Source archives do not carry local Git metadata.
    }
  }
  return {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit && /^[a-f\d]{7,40}$/i.test(commit) ? commit : ''),
  }
}

function siteOrigin() {
  const configured = process.env.SITE_URL || process.env.CF_PAGES_URL
  if (!configured) return defaultOrigin
  const url = new URL(configured)
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('SITE_URL must use HTTPS')
  return url.origin
}

export function socialMetadata(): Plugin {
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return {
    name: 'kinotingla-social',
    transformIndexHtml: {
      order: 'pre',
      handler: html => html
        .replaceAll('%SOCIAL_TITLE%', escape(t.socialTitle))
        .replaceAll('%SOCIAL_DESCRIPTION%', escape(t.socialDescription))
        .replaceAll('%SOCIAL_ORIGIN%', escape(siteOrigin())),
    },
  }
}
