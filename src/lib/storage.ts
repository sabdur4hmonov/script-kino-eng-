import type { Corpus } from './transcript'
import type { Session } from '../types'
export async function fingerprint(file: File): Promise<string> {
  const chunk = 1024 * 1024
  const first = await file.slice(0, chunk).arrayBuffer()
  const last = await file.slice(Math.max(0, file.size - chunk)).arrayBuffer()
  const bytes = new Uint8Array(first.byteLength + last.byteLength)
  bytes.set(new Uint8Array(first))
  bytes.set(new Uint8Array(last), first.byteLength)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return `${file.size}:${Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('')}`
}
let connection: Promise<IDBDatabase> | undefined
function database(): Promise<IDBDatabase> {
  if (!connection)
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kinotingla', 2)
      request.onupgradeneeded = (event) => {
        if (event.oldVersion < 1)
          request.result.createObjectStore('sessions', { keyPath: 'fingerprint' })
        if (event.oldVersion < 2) request.result.createObjectStore('transcripts')
      }
      request.onerror = () => {
        connection = undefined
        reject(request.error)
      }
      request.onblocked = () => {
        connection = undefined
        reject(new Error('Database upgrade blocked'))
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          connection = undefined
        }
        resolve(db)
      }
    })
  return connection
}
export async function loadSession(key: string): Promise<Session | undefined> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('sessions', 'readonly')
    const request = transaction.objectStore('sessions').get(key)
    transaction.oncomplete = () => {
      const value = request.result as Session | undefined
      if (
        value &&
        (!Array.isArray(value.cues) ||
          !Array.isArray(value.attempts) ||
          !Number.isFinite(value.offset) ||
          !Number.isInteger(value.index) ||
          value.index < 0 ||
          (value.cues.length && value.index >= value.cues.length))
      ) {
        reject(new Error('Invalid saved session'))
        return
      }
      resolve(value)
    }
    transaction.onerror = transaction.onabort = () => reject(transaction.error)
  })
}
export async function saveSession(session: Session): Promise<void> {
  const db = await database()
  return new Promise((resolve, reject) => {
    // Separate readwrite transactions are serialized by IndexedDB. Later saves
    // cannot be overwritten by an older request completing out of order.
    const transaction = db.transaction('sessions', 'readwrite')
    transaction.objectStore('sessions').put(session)
    transaction.oncomplete = () => resolve()
    transaction.onerror = transaction.onabort = () => reject(transaction.error)
  })
}

async function transcriptRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('transcripts', mode)
    const request = run(transaction.objectStore('transcripts'))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = transaction.onabort = () => reject(transaction.error)
  })
}
export function loadTranscript(key: string): Promise<Corpus | undefined> {
  return transcriptRequest('readonly', (store) => store.get(key))
}
export async function saveTranscript(key: string, corpus: Corpus) {
  await transcriptRequest('readwrite', (store) => store.put(corpus, key))
}
