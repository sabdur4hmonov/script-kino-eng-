import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const require = createRequire(import.meta.url)
const ortVersion = (
  JSON.parse(
    readFileSync(resolve(dirname(require.resolve('onnxruntime-web')), '../package.json'), 'utf8'),
  ) as { version: string }
).version

function remoteOrtWasm(): Plugin {
  return {
    name: 'pages-onnx-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('onnxruntime-web')) return
      return code.replace(
        /new URL\((["'])(ort-wasm[^"']+\.wasm)\1,\s*import\.meta\.url\)/g,
        (_, _quote, file: string) =>
          'new URL(' +
          JSON.stringify(
            'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ortVersion + '/dist/' + file,
          ) +
          ')',
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es', plugins: () => [remoteOrtWasm()] },
  build: {
    // Serve even small font subsets as files under the same-origin CSP.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
})
