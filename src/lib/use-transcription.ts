import { useEffect, useRef, useState } from 'react'
import type { Cue, MediaScan, Session } from '../types'
import { audioWindows, quietCut } from './audio-window'
import type { DecodeWindow } from './audio-window'
import { WhisperClient } from './whisper-client'
import { coverage, nextWindow, sentences } from './transcript'
import type { Corpus, TranscriptWindow } from './transcript'
import { sampleRate } from './whisper-types'
import type { WhisperModel } from './whisper-types'
import { loadTranscript, saveTranscript } from './storage'

export function useTranscription({
  scan,
  key,
  enabled,
  position,
  model,
  webgpu,
  includeShort,
  retry,
  onCues,
}: {
  scan?: MediaScan
  key?: string
  enabled: boolean
  position?: number
  model: WhisperModel
  webgpu: boolean
  includeShort: boolean
  retry: number
  onCues: (cues: Cue[], done: boolean) => void
}) {
  const [corpus, setCorpus] = useState<Corpus>()
  const [bytes, setBytes] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [storageFailed, setStorageFailed] = useState(false)
  const [priority, prioritize] = useState<number>()
  const [visible, setVisible] = useState(!document.hidden)
  const client = useRef<WhisperClient | undefined>(undefined)
  const decode = useRef<DecodeWindow | undefined>(undefined)
  const fallback = useRef<ReturnType<typeof import('./ffmpeg-audio').fallbackAudio> | undefined>(
    undefined,
  )
  const [hasFallback, setHasFallback] = useState(false)
  const contextRef = useRef<AbortController | undefined>(undefined)
  const task = useRef(false)
  const [cycle, setCycle] = useState(0)
  const corpusRef = useRef<Corpus | undefined>(undefined)
  const owner = useRef<string | undefined>(undefined)
  const callback = useRef(onCues)
  callback.current = onCues
  useEffect(() => {
    const change = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  useEffect(() => {
    owner.current = key
    corpusRef.current = undefined
    setCorpus(undefined)
    setBytes(0)
    setBusy(false)
    setFailed(false)
    setStorageFailed(false)
    prioritize(undefined)
    decode.current = undefined
    setHasFallback(false)
    if (!scan?.audio || !enabled || !key) return
    const controller = new AbortController()
    contextRef.current = controller
    const { signal } = controller
    client.current = new WhisperClient()
    void (async () => {
      const restored = await loadTranscript(key).catch(() => {
        if (!signal.aborted) setStorageFailed(true)
        return undefined
      })
      signal.throwIfAborted()
      const duration =
        restored?.duration ??
        (await scan.audio!.getDurationFromMetadata()) ??
        (await scan.audio!.computeDuration())
      signal.throwIfAborted()
      if (!(duration > 0) || !Number.isFinite(duration))
        throw new Error('Media duration unavailable')
      const native = await scan.audio!.canDecode().catch(() => false)
      signal.throwIfAborted()
      if (native) decode.current = audioWindows(scan.audio!)
      else {
        const { fallbackAudio, fallbackCodec } = await import('./ffmpeg-audio')
        signal.throwIfAborted()
        if (!scan.localFile || !fallbackCodec(scan.audioCodec))
          throw new Error('Native audio decoding unavailable')
        const converter = fallbackAudio(scan.localFile, signal)
        fallback.current = converter
        decode.current = converter.decode
        setHasFallback(true)
      }
      const value = restored ?? { duration, windows: [] }
      corpusRef.current = value
      setCorpus(value)
    })().catch(() => {
      if (!signal.aborted) setFailed(true)
    })
    return () => {
      controller.abort()
      fallback.current?.dispose()
      fallback.current = undefined
      client.current?.dispose()
      client.current = undefined
      contextRef.current = undefined
    }
  }, [scan, key, enabled, retry])

  const active = enabled && key && owner.current === key ? corpus : undefined
  const done = !!active && coverage(active) >= active.duration - 0.001
  useEffect(() => {
    if (!active) return
    callback.current(
      active.windows.flatMap((window) => sentences(window, includeShort)),
      done,
    )
  }, [active, includeShort, done])

  useEffect(() => {
    const controller = contextRef.current
    const decoder = decode.current
    const worker = client.current
    if (!active || !decoder || !controller || !worker || !visible || task.current || failed || !key)
      return
    const signal = controller.signal
    const range = nextWindow(active, position ?? coverage(active), priority)
    if (!range) {
      if (priority !== undefined) prioritize(undefined)
      return
    }
    task.current = true
    setBusy(true)
    void (async () => {
      const pcm = await decoder(range.start, range.end, signal)
      const cut = quietCut(
        pcm,
        range.end >= active.duration - 0.001 || range.end - range.start < 29,
      )
      const piece = cut === pcm.length ? pcm : pcm.slice(0, cut)
      const end = Math.min(range.end, range.start + cut / sampleRate)
      let peak = 0
      for (const value of piece) peak = Math.max(peak, Math.abs(value))
      const result =
        peak > 0.002 && piece.length > 0
          ? await worker.run(piece, model, webgpu, signal, setBytes)
          : { chunks: [], wordTimestamps: true }
      signal.throwIfAborted()
      const part: TranscriptWindow = { start: range.start, end, ...result, model }
      const base = corpusRef.current ?? active
      const updated = {
        ...base,
        windows: [...base.windows, part].sort((a, b) => a.start - b.start),
      }
      await saveTranscript(key, updated).catch(() => {
        if (!signal.aborted) setStorageFailed(true)
      })
      signal.throwIfAborted()
      corpusRef.current = updated
      setCorpus(updated)
      if (priority !== undefined && range.start <= priority && end > priority) prioritize(undefined)
    })()
      .catch(() => {
        if (!signal.aborted) setFailed(true)
      })
      .finally(() => {
        task.current = false
        if (!signal.aborted) setBusy(false)
        setCycle((value) => value + 1)
      })
  }, [active, position, priority, model, webgpu, visible, failed, cycle, key])

  return {
    corpus: active,
    seconds: active ? coverage(active) : 0,
    done,
    bytes,
    busy,
    failed,
    storageFailed,
    prioritize,
    decode,
    client,
    contextRef,
    fallback,
    hasFallback,
  }
}

export function applyTranscript(session: Session, cues: Cue[], source: string, done: boolean) {
  if (session.source && session.source !== source) return session
  cues = cues.map((cue) => session.refinements?.[cue.id] ?? cue)
  const current = session.cues[session.index]
  const index = current
    ? Math.max(
        0,
        cues.findIndex((cue) => cue.id === current.id),
      )
    : 0
  return { ...session, source, cues, index, completed: done && session.completed }
}
