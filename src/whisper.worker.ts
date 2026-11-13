import { transcribePcm } from './lib/whisper-engine'
import type { WhisperReply, WhisperRequest } from './lib/whisper-types'

let queue = Promise.resolve()
self.addEventListener('message', (event: MessageEvent<WhisperRequest>) => {
  const { id, pcm, model, webgpu } = event.data
  const send = (message: WhisperReply) => self.postMessage(message)
  queue = queue.then(async () => {
    try {
      const result = await transcribePcm(pcm, model, webgpu ? 'webgpu' : 'wasm', (bytes) =>
        send({ id, type: 'progress', bytes }),
      )
      send({ id, type: 'result', ...result })
    } catch {
      send({ id, type: 'error' })
    }
  })
})
