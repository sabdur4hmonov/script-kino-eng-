import type { WhisperModel, WhisperReply, WhisperRequest } from './whisper-types'

export class WhisperClient {
  private worker?: Worker
  private requestId = 0
  private persistenceRequested = false

  async run(
    pcm: Float32Array,
    model: WhisperModel,
    webgpu: boolean,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ) {
    signal.throwIfAborted()
    if (!this.persistenceRequested) {
      this.persistenceRequested = true
      try {
        void navigator.storage?.persist?.().catch(() => false)
      } catch {
        /* Browser policy may deny storage. */
      }
    }
    const worker = (this.worker ??= new Worker(new URL('../whisper.worker.ts', import.meta.url), {
      type: 'module',
    }))
    const id = ++this.requestId
    return new Promise<Extract<WhisperReply, { type: 'result' }>>((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener('abort', cancel)
        worker.removeEventListener('message', receive)
        worker.removeEventListener('error', fail)
      }
      const cancel = () => {
        cleanup()
        this.dispose()
        reject(signal.reason)
      }
      const fail = () => {
        cleanup()
        this.dispose()
        reject(new Error('Whisper worker failed'))
      }
      const receive = (event: MessageEvent<WhisperReply>) => {
        const message = event.data
        if (message.id !== id) return
        if (message.type === 'progress') {
          progress(message.bytes)
          return
        }
        cleanup()
        if (message.type === 'result') resolve(message)
        else {
          this.dispose()
          reject(new Error('Whisper inference failed'))
        }
      }
      worker.addEventListener('message', receive)
      worker.addEventListener('error', fail, { once: true })
      signal.addEventListener('abort', cancel, { once: true })
      const request: WhisperRequest = { id, pcm, model, webgpu }
      worker.postMessage(request, [pcm.buffer])
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = undefined
  }
}
