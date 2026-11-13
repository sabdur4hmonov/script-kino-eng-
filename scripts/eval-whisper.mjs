import { createServer } from 'vite'
const vite = await createServer({
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom',
})
try {
  await vite.ssrLoadModule('/scripts/eval-whisper.ts')
} finally {
  await vite.close()
}
