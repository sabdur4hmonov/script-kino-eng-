import { reportError } from './diagnostics'
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
    let worker: Worker
    try {
      worker = (this.worker ??= new Worker(new URL('../whisper.worker.ts', import.meta.url), {
        type: 'module',
      }))
    } catch (error) {
      reportError('worker', error)
      throw error
    }
    const id = ++this.requestId
    return new Promise<Extract<WhisperReply, { type: 'result' }>>((resolve, reject) => {
      const cleanup = () => {
        signal.removeEventListener('abort', cancel)
        worker.removeEventListener('message', receive)
        worker.removeEventListener('error', fail)
        worker.removeEventListener('messageerror', fail)
      }
      const cancel = () => {
        cleanup()
        this.dispose()
        reject(signal.reason)
      }
      const fail = (event?: Event) => {
        event?.preventDefault()
        cleanup()
        this.dispose()
        const error = new Error('Whisper worker failed')
        reportError('worker', error)
        reject(error)
      }
      const receive = (event: MessageEvent<WhisperReply>) => {
        const message = event.data
        if (!message || !['progress', 'result', 'error'].includes(message.type)) {
          fail()
          return
        }
        if (message.id !== id) return
        if (message.type === 'progress') {
          progress(message.bytes)
          return
        }
        cleanup()
        if (message.type === 'result') resolve(message)
        else {
          this.dispose()
          const error = new Error('Whisper inference failed')
          reportError('worker', error)
          reject(error)
        }
      }
      worker.addEventListener('message', receive)
      worker.addEventListener('error', fail, { once: true })
      worker.addEventListener('messageerror', fail, { once: true })
      signal.addEventListener('abort', cancel, { once: true })
      const request: WhisperRequest = { id, pcm, model, webgpu }
      try {
        worker.postMessage(request, [pcm.buffer])
      } catch {
        fail()
      }
    })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = undefined
  }
}
