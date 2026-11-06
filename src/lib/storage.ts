import type { Session } from '../types'
export async function fingerprint(file: File): Promise<string> {
  const chunk = 1024 * 1024
  const first = await file.slice(0, chunk).arrayBuffer()
  const last = await file.slice(Math.max(0, file.size - chunk)).arrayBuffer()
  const bytes = new Uint8Array(first.byteLength + last.byteLength)
  bytes.set(new Uint8Array(first)); bytes.set(new Uint8Array(last), first.byteLength)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return `${file.size}:${Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('')}`
}
export async function loadSession(_key: string): Promise<Session | undefined> { return undefined }
export async function saveSession(_session: Session): Promise<void> { /* Added in persistence step. */ }
