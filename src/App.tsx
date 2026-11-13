import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { uz as t } from './i18n/uz'
import { HelpDialog } from './HelpDialog'
import type { HelpTopic } from './HelpDialog'
import { WordActions } from './WordActions'
import { ThemeToggle } from './ThemeToggle'
import { FEEDBACK_URL } from './config'
import type { Device, MediaScan, Session } from './types'
import { parseSubtitles, timeLabel, cleanText } from './lib/subtitles'
import { checkAnswer } from './lib/checking'
import { fingerprint, loadSession, saveSession } from './lib/storage'
import { scanMedia } from './lib/media'
import { applyTranscript, useTranscription } from './lib/use-transcription'
import { defaultModel, whisperModels } from './lib/whisper-types'
import type { WhisperModel } from './lib/whisper-types'
import { MEDIA_EXTENSIONS, mediaLink, probeMedia } from './lib/media-input'
import { useVisualViewport } from './hooks'
import './App.css'

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m9 5 11 7-11 7z" />,
    replay: (
      <>
        <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" />
        <path d="m10 8 6 4-6 4z" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
      </>
    ),
    film: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M7 3v18M17 3v18M3 8h4m10 0h4M3 16h4m10 0h4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    headphones: (
      <>
        <path d="M4 14v-3a8 8 0 0 1 16 0v3" />
        <rect x="3" y="12" width="4" height="8" rx="2" />
        <rect x="17" y="12" width="4" height="8" rx="2" />
      </>
    ),
    edit: (
      <>
        <path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15z" />
      </>
    ),
    caption: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="4" />
        <path d="M10 9a3 3 0 1 0 0 6m8-6a3 3 0 1 0 0 6" />
      </>
    ),
    spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" />,
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.spark}
    </svg>
  )
}

const freshSession = (key: string): Session => ({
  fingerprint: key,
  cues: [],
  source: '',
  offset: 0,
  index: 0,
  edits: {},
  attempts: [],
  mistakes: {},
  completed: false,
})
const initialDevice = (): Device =>
  navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches ? 'phone' : 'desktop'

export default function App() {
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null)
  const helpTrigger = useRef<HTMLButtonElement>(null)
  function openHelp(trigger: HTMLButtonElement, topic: HelpTopic = 'subtitles') {
    helpTrigger.current = trigger
    setHelpTopic(topic)
  }
  const [file, setFile] = useState<{ name: string; size: number }>()
  const [mediaSource, setMediaSource] = useState<File | URL>()
  const [link, setLink] = useState('')
  const loadAbort = useRef<AbortController | undefined>(undefined)
  const [url, setUrl] = useState('')
  const [session, setSession] = useState<Session>()
  const [scan, setScan] = useState<MediaScan>()
  const [trackId, setTrackId] = useState('')
  const webgpu = 'gpu' in navigator
  const [model, setModel] = useState<WhisperModel>(() => defaultModel(webgpu))
  const [includeShort, setIncludeShort] = useState(false)
  const [aiRetry, setAiRetry] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [jump, setJump] = useState('')
  const pendingJump = useRef<number | undefined>(undefined)
  const [busy, setBusy] = useState<'scan' | 'extract' | ''>('')
  const [extractionProgress, setExtractionProgress] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<ReturnType<typeof checkAnswer>>()
  const [revealed, setRevealed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [speed, setSpeed] = useState(1)
  const [device, setDevice] = useState<Device>(initialDevice)
  const [statsDevice, setStatsDevice] = useState<Device>(initialDevice)
  const [dragging, setDragging] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const video = useRef<HTMLMediaElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const subtitleInput = useRef<HTMLInputElement>(null)
  const currentScan = useRef<MediaScan | undefined>(undefined)
  const generation = useRef(0)
  const abort = useRef<AbortController | undefined>(undefined)
  const clipEnd = useRef<number | undefined>(undefined)
  const clipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const typing = useRef({ ms: 0, last: 0, device: initialDevice() })
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pasted = useRef(false)
  useVisualViewport()

  const cue = session?.cues[session.index]
  const cueText = cue ? (session?.edits[cue.id] ?? cue.text) : ''
  const auto = !session?.source || session.source === t.aiSource
  const ai = useTranscription({
    scan,
    key: session?.fingerprint,
    enabled: auto,
    position: cue?.start ?? 0,
    model,
    webgpu,
    includeShort,
    retry: aiRetry,
    onCues(cues, done) {
      setSession((current) => {
        if (!current) return current
        const updated = applyTranscript(current, cues, t.aiSource, done)
        if (pendingJump.current !== undefined) {
          const index = cues.findIndex((item) => item.end >= pendingJump.current!)
          if (index >= 0) return { ...updated, index, work: undefined, completed: false }
        }
        if (waiting && updated.index + 1 < cues.length)
          return { ...updated, index: updated.index + 1, work: undefined, completed: false }
        return updated
      })
    },
  })
  useEffect(() => {
    if (pendingJump.current !== undefined && cue && cue.end >= pendingJump.current)
      pendingJump.current = undefined
    setWaiting(false)
  }, [cue?.id])
  const stopClip = useCallback(() => {
    clearTimeout(clipTimer.current)
    clipEnd.current = undefined
    video.current?.pause()
    setPlaying(false)
  }, [])

  useEffect(() => {
    document.title = `${t.brand}${t.brandAccent} · ${t.tagline}`
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.description)
  }, [])
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])
  useEffect(
    () => () => {
      generation.current++
      loadAbort.current?.abort()
      abort.current?.abort()
      currentScan.current?.dispose()
      clearTimeout(clipTimer.current)
      clearTimeout(draftTimer.current)
    },
    [],
  )
  useEffect(() => {
    if (!session) return
    let active = true
    setSaved(false)
    void saveSession(session)
      .then(() => {
        if (active) setSaved(true)
      })
      .catch(() => {
        if (active) setStorageError(true)
      })
    return () => {
      active = false
    }
  }, [session])
  useEffect(() => {
    stopClip()
    clearTimeout(draftTimer.current)
    const work = session?.work?.cueId === cue?.id ? session?.work : undefined
    setAnswer(work?.answer ?? '')
    setResult(work?.checked ? checkAnswer(cueText, work.answer) : undefined)
    setRevealed(work?.revealed ?? false)
    setEditing(false)
    pasted.current = false
    typing.current = { ms: work?.ms ?? 0, last: 0, device: work?.device ?? initialDevice() }
  }, [cue?.id, session?.fingerprint, session?.source, stopClip])

  async function pickVideo(selected?: File | URL) {
    if (!selected) return
    const remote = selected instanceof URL
    if (
      !remote &&
      !MEDIA_EXTENSIONS.split(',').some((ext) => selected.name.toLowerCase().endsWith(ext))
    ) {
      setError(t.invalidVideo)
      return
    }
    const run = ++generation.current
    stopClip()
    clearTimeout(draftTimer.current)
    abort.current?.abort()
    loadAbort.current?.abort()
    const controller = new AbortController()
    loadAbort.current = controller
    currentScan.current?.dispose()
    currentScan.current = undefined
    setScan(undefined)
    setWaiting(false)
    pendingJump.current = undefined
    setSession(undefined)
    setAnswer('')
    setResult(undefined)
    setRevealed(false)
    setFile(remote ? undefined : selected)
    setMediaSource(selected)
    setUrl(remote ? '' : URL.createObjectURL(selected))
    setBusy('scan')
    setError('')
    setNotice('')
    setStorageError(false)
    try {
      const meta = remote
        ? await probeMedia(selected, controller.signal)
        : { name: selected.name, size: selected.size, key: await fingerprint(selected) }
      if (run !== generation.current) return
      let restored: Session | undefined
      try {
        restored = await loadSession(meta.key)
      } catch {
        if (run === generation.current) setStorageError(true)
      }
      if (run !== generation.current) return
      if (!remote) setSession(restored ?? freshSession(meta.key))
      try {
        const info = await scanMedia(selected, meta.size, controller.signal)
        if (run !== generation.current) {
          info.dispose()
          return
        }
        currentScan.current = info
        setScan(info)
        if (remote) {
          setFile(meta)
          setUrl(selected.href)
          setSession(restored ?? freshSession(meta.key))
        }
        if (restored?.cues.length) setNotice(t.restored)
        const preferred =
          info.tracks.find((track) => track.supported && /^(eng|en)(-|$)/i.test(track.language)) ??
          info.tracks.find((track) => track.supported)
        setTrackId(preferred?.id ?? '')
      } catch {
        if (run === generation.current) setNotice(remote ? t.rangeBlocked : t.scanError)
      }
    } catch {
      if (run === generation.current) setError(remote ? t.rangeBlocked : t.fingerprintError)
    } finally {
      if (run === generation.current) setBusy('')
    }
  }

  function replaceCues(cues: Session['cues'], source: string) {
    stopClip()
    clearTimeout(draftTimer.current)
    setAnswer('')
    setResult(undefined)
    setRevealed(false)
    setEditing(false)
    typing.current = { ms: 0, last: 0, device }
    pasted.current = false
    setSession((current) =>
      current
        ? { ...freshSession(current.fingerprint), cues, source, offset: current.offset }
        : current,
    )
    setNotice('')
    setError('')
  }
  async function uploadSubtitles(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected || !session) return
    abort.current?.abort()
    if (selected.size > 20 * 1024 * 1024) {
      setError(t.importLimit)
      return
    }
    const run = generation.current
    try {
      if (!/\.(srt|vtt)$/i.test(selected.name)) throw new Error()
      const cues = parseSubtitles(await selected.text())
      if (run !== generation.current) return
      if (!cues.length) throw new Error()
      replaceCues(cues, selected.name)
    } catch {
      if (run === generation.current) setError(t.subtitleError)
    }
  }
  async function extract() {
    if (!scan || !trackId) return
    const controller = new AbortController()
    abort.current?.abort()
    abort.current = controller
    const run = generation.current
    setBusy('extract')
    setExtractionProgress(0)
    setError('')
    try {
      const cues = await scan.extract(trackId, controller.signal, setExtractionProgress)
      if (controller.signal.aborted || run !== generation.current) return
      if (!cues.length) throw new Error()
      const track = scan.tracks.find((item) => item.id === trackId)
      replaceCues(cues, `${track?.name ?? t.defaultTrack} · ${track?.language ?? ''}`)
    } catch {
      if (!controller.signal.aborted && run === generation.current) setError(t.extractionError)
    } finally {
      if (run === generation.current) setBusy('')
    }
  }

  const replay = useCallback(async () => {
    if (!cue || !video.current || session?.completed) return
    const player = video.current
    stopClip()
    typing.current.last = 0
    const padding = cue.model ? 0.25 : 0.2
    const start = Math.max(0, cue.start + session!.offset - padding)
    const end = Math.min(
      Number.isFinite(player.duration) ? player.duration : Infinity,
      cue.end + session!.offset + padding,
    )
    if (end <= start) {
      setError(t.playError)
      return
    }
    try {
      clipEnd.current = end
      player.currentTime = start
      player.playbackRate = speed
      setPlaying(true)
      await player.play()
    } catch {
      clipEnd.current = undefined
      setPlaying(false)
      setError(t.playError)
    }
  }, [cue, session, speed, stopClip])

  function scheduleClipEnd() {
    clearTimeout(clipTimer.current)
    const player = video.current
    if (!player || clipEnd.current === undefined || player.paused || player.seeking) return
    const remaining = clipEnd.current - player.currentTime
    if (remaining <= 0) {
      stopClip()
      return
    }
    clipTimer.current = setTimeout(
      scheduleClipEnd,
      Math.min(100, (remaining / player.playbackRate) * 1000),
    )
  }
  function onVideoPlay() {
    typing.current.last = 0
    const player = video.current
    if (player && cue && session && !session.completed) {
      setPlaying(true)
      if (clipEnd.current === undefined) {
        const padding = cue.model ? 0.25 : 0.2
        const start = Math.max(0, cue.start + session.offset - padding)
        clipEnd.current = Math.min(
          Number.isFinite(player.duration) ? player.duration : Infinity,
          cue.end + session.offset + padding,
        )
        if (player.currentTime < start || player.currentTime >= clipEnd.current)
          player.currentTime = start
      }
    }
    scheduleClipEnd()
  }
  function advance() {
    stopClip()
    if (auto && ai.corpus && !ai.done && session && session.index >= session.cues.length - 1) {
      setWaiting(true)
      if (cue) ai.prioritize(cue.end)
      return
    }
    clearTimeout(draftTimer.current)
    typing.current.last = 0
    setSession((current) =>
      current
        ? {
            ...current,
            work: undefined,
            index: Math.min(current.index + 1, current.cues.length - 1),
            completed: current.index >= current.cues.length - 1,
          }
        : current,
    )
  }
  function check() {
    if (!cue || !session || !answer.trim() || result || revealed) return
    stopClip()
    clearTimeout(draftTimer.current)
    typing.current.last = 0
    const checked = checkAnswer(cueText, answer)
    setResult(checked)
    setRevealed(true)
    const measurement = typing.current
    setStatsDevice(measurement.device)
    setSession((current) => {
      if (!current) return current
      const mistakes = { ...current.mistakes }
      checked.mistakes.forEach((word) => {
        mistakes[word] = (mistakes[word] ?? 0) + 1
      })
      return {
        ...current,
        mistakes,
        work: {
          cueId: cue.id,
          answer,
          ms: measurement.ms,
          device: measurement.device,
          checked: true,
          revealed: true,
        },
        attempts: [
          ...current.attempts,
          {
            cueId: cue.id,
            correct: checked.correct,
            total: checked.total,
            chars: pasted.current ? 0 : checked.chars,
            ms: pasted.current ? 0 : measurement.ms,
            device: measurement.device,
            at: Date.now(),
          },
        ],
      }
    })
  }
  function submit() {
    if (result || revealed) advance()
    else check()
  }
  function identifyDevice(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.key === 'Unidentified') {
      typing.current.device = 'phone'
      setDevice('phone')
    } else if (event.key.length === 1 && event.keyCode > 0 && !event.ctrlKey && !event.metaKey) {
      typing.current.device = 'desktop'
      setDevice('desktop')
    }
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault()
      submit()
    }
  }
  function onTyping(event: ChangeEvent<HTMLTextAreaElement>) {
    const now = performance.now(),
      clock = typing.current
    if (clock.last) clock.ms += now - clock.last < 2000 ? now - clock.last : 150
    else clock.ms += 150
    clock.last = now
    setAnswer(event.target.value)
    queueDraft(event.target.value)
  }
  function queueDraft(value: string, shown = false, immediate = false) {
    clearTimeout(draftTimer.current)
    if (!cue) return
    setSaved(false)
    const work = {
      cueId: cue.id,
      answer: value,
      ms: typing.current.ms,
      device: typing.current.device,
      checked: !!result,
      revealed: shown || revealed,
    }
    const persist = () =>
      setSession((current) =>
        current && !current.completed && current.cues[current.index]?.id === work.cueId
          ? { ...current, work }
          : current,
      )
    if (immediate) persist()
    else draftTimer.current = setTimeout(persist, 300)
  }
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      if (!helpTopic && event.ctrlKey && event.code === 'Space') {
        event.preventDefault()
        void replay()
      }
    }
    const pauseClock = () => {
      typing.current.last = 0
      if (document.hidden) stopClip()
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('blur', pauseClock)
    document.addEventListener('visibilitychange', pauseClock)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('blur', pauseClock)
      document.removeEventListener('visibilitychange', pauseClock)
    }
  }, [helpTopic, replay, stopClip])
  function speak(word: string) {
    if (!('speechSynthesis' in window)) {
      setNotice(t.speechUnavailable)
      return
    }
    const utterance = new SpeechSynthesisUtterance(word.replace(/[^a-zA-Z’'-]/g, ''))
    utterance.lang = 'en-US'
    utterance.rate = 0.85
    const voice = speechSynthesis.getVoices().find((item) => item.lang === 'en-US')
    if (voice) utterance.voice = voice
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  }
  function saveEdit() {
    if (!cue) return
    const value = cleanText(editText)
    if (!value) {
      setError(t.editEmpty)
      return
    }
    clearTimeout(draftTimer.current)
    setSession((current) =>
      current
        ? { ...current, work: undefined, edits: { ...current.edits, [cue.id]: value } }
        : current,
    )
    setEditing(false)
    setResult(undefined)
    setAnswer('')
    setRevealed(false)
    typing.current.ms = 0
    typing.current.last = 0
  }
  const attempts = session?.attempts.filter((item) => item.device === statsDevice) ?? []
  const totals = attempts.reduce(
    (sum, item) => ({
      correct: sum.correct + item.correct,
      total: sum.total + item.total,
      chars: sum.chars + item.chars,
      ms: sum.ms + item.ms,
    }),
    { correct: 0, total: 0, chars: 0, ms: 0 },
  )
  const accuracy = totals.total ? Math.round((totals.correct / totals.total) * 100) : 0
  const wpm = totals.ms > 0 ? Math.round(totals.chars / 5 / (totals.ms / 60000)) : 0
  const progress = session?.cues.length
    ? Math.round(
        ((session.completed ? session.cues.length : session.index) / session.cues.length) * 100,
      )
    : 0
  const mistakes = Object.entries(session?.mistakes ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
  const answerVisible = revealed && !playing

  const Playback =
    (scan?.audioOnly ?? !!file?.name.match(/\.(mp3|m4a|wav|ogg)$/i)) ? 'audio' : 'video'
  const linkForm = (
    <form
      className="media-link"
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = mediaLink(link)
        if (!parsed.url) {
          setError(parsed.error === 'page' ? t.platformLink : t.invalidLink)
          return
        }
        void pickVideo(parsed.url)
      }}
    >
      <label htmlFor="media-url">{t.mediaLink}</label>
      <div>
        <input
          id="media-url"
          type="text"
          inputMode="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
        />
        <button type="submit" className="button" disabled={!link.trim() || busy === 'scan'}>
          {t.openLink}
        </button>
      </div>
    </form>
  )
  return (
    <div className={`app-shell ${file ? 'studio' : 'landing'}${cue ? ' has-cues' : ''}`}>
      <header className="site-header">
        <a className="brand" href="./" aria-label={`${t.brand}${t.brandAccent}`}>
          <span className="brand-mark">
            <Icon name="film" size={23} />
          </span>
          <span>
            {t.brand}
            <strong>{t.brandAccent}</strong>
          </span>
          <span className="brand-subtitle">{t.tagline}</span>
        </a>
        {file && (
          <div className="file-chip">
            <Icon name="film" size={14} />
            <span title={file.name}>{file.name}</span>
            <small>
              {(file.size / (file.size >= 1e9 ? 1e9 : 1e6)).toFixed(1)}{' '}
              {file.size >= 1e9 ? t.sizeGb : t.sizeMb}
            </small>
            <button
              type="button"
              className="text-button"
              onClick={() => fileInput.current?.click()}
            >
              {t.changeVideo}
            </button>
          </div>
        )}
        <div className="header-actions">
          <button
            type="button"
            className="button help-button"
            aria-haspopup="dialog"
            onClick={(event) => openHelp(event.currentTarget)}
          >
            {t.help}
          </button>
          {!file && (
            <span className="privacy-pill">
              <Icon name="lock" size={14} />
              {t.private}
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>
      <main>
        <nav className="steps" aria-label={t.progress}>
          {[t.stepVideo, t.stepSubtitles, t.stepPractice].map((label, i) => (
            <span
              className={(i === 0 ? !!file : i === 1 ? !!cue : !!result) ? 'step done' : 'step'}
              key={label}
            >
              <b>
                {(i === 0 && file) || (i === 1 && cue) ? (
                  <Icon name="check" size={14} />
                ) : (
                  `0${i + 1}`
                )}
              </b>
              {label}
              {i < 2 && <span className="step-line" />}
            </span>
          ))}
        </nav>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label={t.close}>
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice('')} aria-label={t.close}>
              ×
            </button>
          </div>
        )}
        {storageError && (
          <div className="notice error" role="alert">
            {t.storageError}
          </div>
        )}
        {scan?.audioWarning && (
          <div className="notice warning" role="alert">
            <Icon name="headphones" />
            {scan.audioCodec ? `${scan.audioCodec.toUpperCase()}: ` : ''}
            {scan.audioCodec ? (
              <div>
                {t.audioWarning}{' '}
                <button
                  type="button"
                  className="help-link"
                  aria-haspopup="dialog"
                  onClick={(event) => openHelp(event.currentTarget, 'audio')}
                >
                  {t.audioHelp}
                </button>
              </div>
            ) : (
              t.noAudio
            )}
          </div>
        )}
        <div className="workspace-grid">
          {!file && (
            <section className="intro">
              <p className="eyebrow">
                <span />
                {t.eyebrow}
              </p>
              <h1>
                {t.title}
                <br />
                <em>{t.titleAccent}</em>
              </h1>
              <p className="intro-copy">{t.intro}</p>
              <button
                className="button primary hero-action"
                onClick={() => fileInput.current?.click()}
              >
                <Icon name="upload" size={18} />
                {t.chooseVideo}
                <Icon name="arrow" size={16} />
              </button>
              <div className="hero-chips">
                {t.heroChips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </section>
          )}
          <div className="main-column">
            <section className="panel video-panel">
              <div className="panel-heading">
                <h2>
                  <Icon name="film" />
                  {t.workspace}
                </h2>
              </div>
              <input
                ref={fileInput}
                hidden
                type="file"
                accept={MEDIA_EXTENSIONS}
                aria-label={t.chooseVideo}
                onChange={(event) => {
                  void pickVideo(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              {url ? (
                <div
                  className={`video-wrap ${Playback === 'audio' ? 'audio-wrap' : ''}${playing ? ' is-playing' : ''}`}
                >
                  <Playback
                    ref={(element) => {
                      video.current = element
                    }}
                    crossOrigin={mediaSource instanceof URL ? 'anonymous' : undefined}
                    src={url}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={Playback === 'audio' ? t.audioLabel : t.videoLabel}
                    onError={() => setError(t.playbackError)}
                    onLoadedMetadata={() => {
                      if (video.current)
                        for (const track of video.current.textTracks) track.mode = 'disabled'
                    }}
                    onPlay={onVideoPlay}
                    onPlaying={scheduleClipEnd}
                    onSeeked={scheduleClipEnd}
                    onRateChange={scheduleClipEnd}
                    onPause={() => {
                      clearTimeout(clipTimer.current)
                      setPlaying(false)
                    }}
                    onTimeUpdate={scheduleClipEnd}
                    onEnded={stopClip}
                  />
                  {playing && <span className="playing-badge">{t.clipping}</span>}
                </div>
              ) : (
                <div
                  className={`video-drop ${dragging ? 'dragging' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    void pickVideo(event.dataTransfer.files[0])
                  }}
                >
                  <span className="screen-label" aria-hidden="true">
                    {t.screenLabel}
                  </span>
                  <div className="empty-film" aria-hidden="true">
                    <span className="mini-play">
                      <Icon name="play" size={34} />
                    </span>
                  </div>
                  <h3>{t.dropVideo}</h3>
                  <p>{t.videoHint}</p>
                  <button className="button primary" onClick={() => fileInput.current?.click()}>
                    <Icon name="upload" size={17} />
                    {t.chooseVideo}
                  </button>
                  <small>{t.videoFormats}</small>
                </div>
              )}
              {!file && (
                <div className="example-card" aria-hidden="true">
                  <div className="answer-heading">
                    <span>{t.exampleResult}</span>
                    <b>67{t.percent}</b>
                  </div>
                  <div className="diff" lang="en">
                    <span className="diff-correct">{t.exampleWords[0]}</span>
                    <span className="diff-wrong">{t.exampleWords[1]}</span>
                    <span className="diff-missing">{t.exampleWords[2]}</span>
                  </div>
                </div>
              )}
              {linkForm}
              <div className="video-foot">
                <span>
                  <Icon name="lock" size={13} />
                  {file ? file.name : t.localNote}
                </span>
                {file && (
                  <small>
                    {(file.size / (file.size >= 1e9 ? 1e9 : 1e6)).toFixed(1)}{' '}
                    {file.size >= 1e9 ? t.sizeGb : t.sizeMb}
                  </small>
                )}
              </div>
            </section>
            <section className="panel practice-panel">
              {cue && (
                <div className="deck-progress" aria-hidden="true">
                  <span style={{ width: progress + '%' }} />
                </div>
              )}
              <div className="panel-heading">
                <h2>
                  <Icon name="headphones" />
                  {t.practiceTitle}
                </h2>
                {cue && (
                  <span className="line-count">
                    {t.line} {session!.index + 1} {t.of} {session!.cues.length}
                  </span>
                )}
              </div>
              {!cue ? (
                <div className="empty-practice">
                  <span className="empty-lines">
                    <i />
                    <i />
                    <i />
                  </span>
                  <h3>{t.emptyPractice}</h3>
                  <p>{t.emptyPracticeHint}</p>
                </div>
              ) : session!.completed ? (
                <div className="finished">
                  <span>✦</span>
                  <h3>{t.finished}</h3>
                  <p>{t.finishedHint}</p>
                  <button
                    className="button primary"
                    onClick={() => {
                      setSession((current) =>
                        current
                          ? { ...current, index: 0, work: undefined, completed: false }
                          : current,
                      )
                      typing.current = { ms: 0, last: 0, device }
                      pasted.current = false
                      setResult(undefined)
                      setAnswer('')
                      setRevealed(false)
                    }}
                  >
                    {t.restart}
                    <Icon name="replay" size={17} />
                  </button>
                  <a
                    className="help-link feedback-link"
                    href={FEEDBACK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t.feedback}
                  </a>
                </div>
              ) : (
                <>
                  <div className="clip-controls">
                    <button
                      className={`button replay ${playing ? 'is-playing' : ''}`}
                      aria-label={playing ? t.clipping : t.replay}
                      onClick={() => void replay()}
                    >
                      {playing ? (
                        <span className="equalizer" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        <Icon name="replay" size={22} />
                      )}
                    </button>
                    <span className="replay-info">
                      <strong aria-hidden="true">{playing ? t.clipping : t.replay}</strong>
                      <span className="clip-time">
                        {timeLabel(cue.start + session!.offset)} —{' '}
                        {timeLabel(cue.end + session!.offset)}
                      </span>
                    </span>
                    <div className="speed" aria-label={t.speed}>
                      {[0.75, 1].map((value) => (
                        <button
                          key={value}
                          aria-pressed={speed === value}
                          className={speed === value ? 'selected' : ''}
                          onClick={() => {
                            setSpeed(value)
                            if (video.current) video.current.playbackRate = value
                          }}
                        >
                          {value === 1 ? t.speedNormal : t.speedSlow}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="input-label" htmlFor="dictation">
                    {t.inputLabel}
                    <span>{device === 'phone' ? t.phone : t.desktop}</span>
                  </label>
                  <textarea
                    ref={input}
                    id="dictation"
                    lang="en"
                    className="dictation-input"
                    placeholder={t.inputPlaceholder}
                    value={answer}
                    readOnly={!!result || revealed}
                    onChange={onTyping}
                    onKeyDown={identifyDevice}
                    onCompositionStart={() => {
                      typing.current.device = 'phone'
                      setDevice('phone')
                    }}
                    onBlur={() => {
                      typing.current.last = 0
                      queueDraft(answer, revealed, true)
                    }}
                    onPaste={() => {
                      pasted.current = true
                      typing.current.last = 0
                    }}
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    autoComplete="off"
                    rows={3}
                    maxLength={2500}
                  />
                  <div className="practice-actions">
                    <button
                      className="button primary"
                      onClick={submit}
                      disabled={!answer.trim() && !revealed && !result}
                    >
                      {result || revealed ? t.next : t.check}
                      <Icon name={result || revealed ? 'arrow' : 'check'} size={17} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        stopClip()
                        setRevealed(true)
                        typing.current.last = 0
                        queueDraft(answer, true, true)
                        input.current?.focus()
                      }}
                    >
                      {t.showAnswer}
                    </button>
                    <button className="text-button skip" onClick={advance}>
                      {t.skip} ↗
                    </button>
                  </div>
                  <p className="hotkeys">
                    <span>
                      <kbd>{t.keyCtrl}</kbd> + <kbd>{t.keySpace}</kbd> {t.hotkeyReplay}
                    </span>
                    <span>
                      <kbd>{t.keyEnter}</kbd> {t.hotkeyCheck}
                    </span>
                  </p>
                  {answerVisible && (
                    <div className="answer-panel" aria-live="polite">
                      <div className="answer-heading">
                        <span>{t.answer}</span>
                        {result && (
                          <b
                            data-score={
                              result.accuracy >= 90
                                ? 'good'
                                : result.accuracy >= 60
                                  ? 'fair'
                                  : 'bad'
                            }
                          >
                            {result.accuracy}
                            {t.percent}
                          </b>
                        )}
                      </div>
                      <p className="answer-words" lang="en">
                        {cueText.split(/\s+/).map((word, i) => (
                          <WordActions key={i} word={word} speak={speak} />
                        ))}
                      </p>
                      <small>{t.speakHint}</small>
                      {result && (
                        <>
                          <div className="diff" lang="en">
                            {result.diff.map((word, i) => (
                              <span className={`diff-${word.kind}`} key={i}>
                                {word.text}
                              </span>
                            ))}
                          </div>
                          <div className="diff-legend">
                            <span className="correct-dot">{t.correct}</span>
                            <span className="wrong-dot">{t.wrong}</span>
                            <span className="missing-dot">{t.missing}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="practice-bottom">
                    <span>{t.numbered}</span>
                    <button
                      className="text-button"
                      onClick={() => {
                        stopClip()
                        setEditText(cueText)
                        setEditing(true)
                      }}
                    >
                      <Icon name="edit" size={13} />
                      {t.edit}
                    </button>
                  </div>
                  {editing && (
                    <div className="edit-box">
                      <label htmlFor="edit-cue">{t.editTitle}</label>
                      <textarea
                        id="edit-cue"
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        rows={3}
                        maxLength={2500}
                      />
                      <div>
                        <button className="button primary small" onClick={saveEdit}>
                          {t.saveEdit}
                        </button>
                        <button className="text-button" onClick={() => setEditing(false)}>
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
          {!file && (
            <section className="how-section" aria-labelledby="how-title">
              <p className="section-kicker">
                <span />
                {t.howKicker}
              </p>
              <h2 id="how-title">{t.howTitle}</h2>
              <div className="how-cards">
                {t.howSteps.map(([title, text], index) => (
                  <article key={title}>
                    <span aria-hidden="true">0{index + 1}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
          <aside className="side-column">
            <section className="panel subtitle-panel">
              <div className="panel-heading">
                <h2>
                  <Icon name="caption" />
                  {t.subtitleTitle}
                </h2>
                <span className="section-number">02</span>
              </div>
              <p className="panel-copy">{t.readySubtitles}</p>
              <button
                type="button"
                className="help-link subtitle-help"
                aria-haspopup="dialog"
                onClick={(event) => openHelp(event.currentTarget)}
              >
                {t.subtitleHelp}
              </button>
              <input
                ref={subtitleInput}
                hidden
                type="file"
                accept=".srt,.vtt"
                aria-label={t.uploadSubtitles}
                onChange={(event) => void uploadSubtitles(event)}
              />
              <button
                className="button upload-subtitle"
                disabled={!session || busy === 'extract'}
                onClick={() => subtitleInput.current?.click()}
              >
                <Icon name="upload" size={17} />
                {t.uploadSubtitles}
              </button>
              {file && auto && scan?.audio && (
                <div className="ai-status">
                  <strong>{t.aiSource}</strong>
                  {ai.corpus && (
                    <span>
                      {timeLabel(ai.seconds)} / {timeLabel(ai.corpus.duration)} {t.aiProgress}
                    </span>
                  )}
                  {ai.busy && (
                    <span>
                      {ai.bytes
                        ? t.aiLoading + ' ' + (ai.bytes / 1e6).toFixed(1) + ' MB'
                        : t.aiPreparing}
                    </span>
                  )}
                  {waiting && <span>{t.aiWaiting}</span>}
                  {ai.done && !session?.cues.length && <span>{t.aiEmpty}</span>}
                  {ai.failed && (
                    <>
                      <span>{t.aiFailed}</span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setAiRetry((value) => value + 1)}
                      >
                        {t.aiRetry}
                      </button>
                    </>
                  )}
                  {ai.storageFailed && <span>{t.storageError}</span>}
                  <details>
                    <summary>{t.aiSettings}</summary>
                    <label>
                      {t.aiModel}
                      <select
                        value={model}
                        onChange={(event) => setModel(event.target.value as WhisperModel)}
                      >
                        {whisperModels.map((value) => (
                          <option key={value} value={value}>
                            {t.aiModelNames[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={includeShort}
                        onChange={(event) => setIncludeShort(event.target.checked)}
                      />{' '}
                      {t.aiShort}
                    </label>
                  </details>
                </div>
              )}
              {busy && (
                <div className="loading" role="status">
                  <i />
                  {busy === 'scan' ? t.scanning : `${t.extracting} ${extractionProgress}%`}
                  {busy === 'extract' && (
                    <button className="text-button" onClick={() => abort.current?.abort()}>
                      {t.cancel}
                    </button>
                  )}
                </div>
              )}
              {scan && (
                <div className="embedded-tracks">
                  {scan.tracks.length ? (
                    <>
                      <label htmlFor="tracks">{t.trackLabel}</label>
                      <select
                        id="tracks"
                        value={trackId}
                        onChange={(event) => setTrackId(event.target.value)}
                        disabled={busy === 'extract'}
                      >
                        <option value="">{t.trackPlaceholder}</option>
                        {scan.tracks.map((track) => (
                          <option key={track.id} value={track.id} disabled={!track.supported}>
                            {track.name || t.defaultTrack} · {track.language || t.unknownLanguage} (
                            {track.codec}){!track.supported ? ` · ${t.unsupportedTrack}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        className="button outline small"
                        onClick={() => void extract()}
                        disabled={!trackId || !!busy}
                      >
                        {t.extract}
                      </button>
                    </>
                  ) : (
                    <p>{t.noTracks}</p>
                  )}
                </div>
              )}
              {session?.cues.length ? (
                <div className="subtitle-status">
                  <span className="status-check">
                    <Icon name="check" size={13} />
                  </span>
                  <div>
                    <strong>{session.source}</strong>
                    <small>
                      {session.cues.length} {t.loadedLines}
                    </small>
                  </div>
                </div>
              ) : (
                <small className="muted-note">{file ? t.formatNote : t.chooseFirst}</small>
              )}
              {!!session?.cues.length && (
                <>
                  <div className="sync-heading">
                    <span>{t.sync}</span>
                    <b>
                      {session.offset > 0 ? '+' : ''}
                      {session.offset.toFixed(1)} {t.seconds}
                    </b>
                  </div>
                  <div className="sync-buttons">
                    {[-0.5, -0.1, 0.1, 0.5].map((shift) => (
                      <button
                        aria-label={`${shift < 0 ? t.shiftEarlier : t.shiftLater} ${Math.abs(shift)} ${t.seconds}`}
                        key={shift}
                        onClick={() => {
                          stopClip()
                          setSession((current) =>
                            current
                              ? {
                                  ...current,
                                  offset: Math.round((current.offset + shift) * 10) / 10,
                                }
                              : current,
                          )
                        }}
                      >
                        {shift > 0 ? '+' : '−'}
                        {Math.abs(shift).toFixed(1)}
                      </button>
                    ))}
                  </div>
                  <div className="sync-foot">
                    <small>{t.syncHint}</small>
                    <button
                      className="text-button"
                      onClick={() => {
                        stopClip()
                        setSession((current) => (current ? { ...current, offset: 0 } : current))
                      }}
                    >
                      {t.reset}
                    </button>
                  </div>
                </>
              )}
            </section>
            <section className="panel stats-panel">
              <div className="panel-heading">
                <h2>
                  <Icon name="spark" />
                  {t.stats}
                </h2>
              </div>
              <p className="panel-copy">{t.statsHint}</p>
              <div className="device-tabs" aria-label={t.device}>
                {(['desktop', 'phone'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={statsDevice === value}
                    className={statsDevice === value ? 'selected' : ''}
                    onClick={() => setStatsDevice(value)}
                  >
                    {value === 'phone' ? t.phone : t.desktop}
                  </button>
                ))}
              </div>
              <div className="stats-numbers">
                <div>
                  <div className="accuracy-ring">
                    <svg viewBox="0 0 64 64" aria-hidden="true">
                      <circle cx="32" cy="32" r="28" />
                      <circle
                        className="ring-value"
                        cx="32"
                        cy="32"
                        r="28"
                        pathLength="100"
                        strokeDasharray={accuracy + ' 100'}
                      />
                    </svg>
                    <strong>
                      {accuracy}
                      <small>{t.percent}</small>
                    </strong>
                  </div>
                  <span>{t.accuracy}</span>
                </div>
                <div>
                  <strong>{wpm}</strong>
                  <span>{t.wpm}</span>
                </div>
              </div>
              <div className="stats-meta">
                <span>
                  {t.checked}
                  <b>{attempts.length}</b>
                </span>
                <span>
                  {t.typingTime}
                  <b>{timeLabel(totals.ms / 1000)}</b>
                </span>
              </div>
              <div className="progress-heading">
                <span>{t.progress}</span>
                <b>
                  {progress}
                  {t.percent}
                </b>
              </div>
              <progress value={progress} max="100" aria-label={t.progress} />
              <div className="save-status">
                <span className={saved && !storageError ? 'status-dot' : 'status-dot inactive'} />
                {storageError ? t.private : !session ? t.ready : saved ? t.saved : t.saving}
              </div>
            </section>
            <section className="mistakes-panel">
              <h2>
                {t.mistakes}
                <span>{mistakes.length.toString().padStart(2, '0')}</span>
              </h2>
              {mistakes.length ? (
                <div className="mistake-words" lang="en">
                  {mistakes.map(([word, count]) => (
                    <WordActions key={word} word={word} count={count} speak={speak} />
                  ))}
                </div>
              ) : (
                <p>{t.mistakesEmpty}</p>
              )}
            </section>
          </aside>
        </div>
        {session && (!!session.cues.length || !!(auto && ai.corpus)) && (
          <section className="panel cue-list">
            <button
              className="list-toggle"
              onClick={() => setListOpen(!listOpen)}
              aria-expanded={listOpen}
            >
              {t.subtitleList}
              <span>{listOpen ? '−' : '+'}</span>
            </button>
            {listOpen && (
              <div className="cue-list-scroll">
                {auto && ai.corpus && (
                  <form
                    className="ai-jump"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const seconds = Math.max(0, Math.min(Number(jump), ai.corpus!.duration - 1))
                      const window = ai.corpus!.windows.find(
                        (part) => part.start <= seconds && part.end > seconds,
                      )
                      const index = window
                        ? (session?.cues ?? []).findIndex(
                            (cue) => cue.start < window.end && cue.end >= seconds,
                          )
                        : -1
                      if (index >= 0) {
                        setSession(
                          (current) =>
                            current && { ...current, index, completed: false, work: undefined },
                        )
                        return
                      }
                      pendingJump.current = seconds
                      setWaiting(true)
                      ai.prioritize(seconds)
                    }}
                  >
                    <label>
                      {t.aiJumpSeconds}{' '}
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={jump}
                        onChange={(event) => setJump(event.target.value)}
                      />
                    </label>
                    <button className="button small">{t.aiJump}</button>
                  </form>
                )}
                {session.cues.map((item, index) => (
                  <div
                    className={`cue-row ${index === session.index ? 'active' : ''}`}
                    key={item.id}
                  >
                    <button
                      aria-label={`${t.jump} ${index + 1}`}
                      onClick={() => {
                        stopClip()
                        setSession((current) =>
                          current ? { ...current, index, completed: false } : current,
                        )
                        setListOpen(false)
                      }}
                    >
                      {String(index + 1).padStart(2, '0')}
                      <small>{timeLabel(item.start + session.offset)}</small>
                    </button>
                    <span lang="en">{session.edits[item.id] ?? item.text}</span>
                    <button
                      className="text-button"
                      aria-label={`${t.edit} ${index + 1}`}
                      onClick={() => {
                        stopClip()
                        setSession((current) =>
                          current ? { ...current, index, completed: false } : current,
                        )
                        setEditText(session.edits[item.id] ?? item.text)
                        setTimeout(() => setEditing(true), 0)
                        setListOpen(false)
                      }}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        <div className="privacy-note">
          <Icon name="lock" size={18} />
          <div>
            <strong>{t.privacyTitle}</strong>
            <p>{t.privacyBody}</p>
          </div>
        </div>
      </main>
      <footer>
        <span>{t.footer}</span>
        <span>{t.footerNote}</span>
        <a
          className="help-link feedback-link"
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.feedback}
        </a>
      </footer>
      <HelpDialog
        topic={helpTopic}
        onClose={() => {
          setHelpTopic(null)
          helpTrigger.current?.focus()
        }}
      />
    </div>
  )
}
