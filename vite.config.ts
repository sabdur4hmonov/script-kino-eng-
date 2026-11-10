import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Serve even small font subsets as files under the same-origin CSP.
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
})
