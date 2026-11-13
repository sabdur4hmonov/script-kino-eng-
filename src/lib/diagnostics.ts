import { uz as t } from '../i18n/uz'

type Source = keyof typeof t.diagnosticSources
type Context = { model?: string; fileType?: string; size?: number; codec?: string }
type Report = { context: Context; source: Source; kind: string; message: string | undefined; frames: string[] }
let context: Context = {}
let current: Report | undefined
const listeners = new Set<() => void>()

export function updateDiagnostics(value: Context) { context = value }
export const subscribeDiagnostic = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const getDiagnostic = () => current
export function clearDiagnostic() { current = undefined; listeners.forEach(listener => listener()) }

const errorKinds = new Set(['Error','TypeError','RangeError','ReferenceError','SyntaxError','URIError','EvalError','NetworkError','NotSupportedError','InvalidStateError','QuotaExceededError','OperationError','DataError','SecurityError','AbortError'])
const safeMessages: Record<string, string> = {
  'Whisper worker failed': t.whisperWorkerError,
  'Whisper inference failed': t.whisperInferenceError,
  'FFmpeg worker failed': t.ffmpegProcessError,
  'FFmpeg core unavailable': t.ffmpegWorkerError,
  'FFmpeg could not decode this clip': t.ffmpegDecodeError,
}

// Unknown error messages and stack labels can contain input values. Keep only
// recognized messages and coordinates in the app's scripts.
export function safeFrames(stack: string, origin: string) {
  const frames: string[] = []
  for (const line of stack.split('\n').slice(1, 30)) {
    const location = /(?:^|[\s@(])(https?:\/\/[^\s()]+):(\d{1,8}):(\d{1,8})\)?\s*$/.exec(line)
    if (!location) continue
    try {
      const url = new URL(location[1])
      if (url.origin !== origin || url.username || url.password) continue
      const bundle = /^\/assets\/(?:index|whisper\.worker|worker|ffmpeg-audio)-[a-zA-Z0-9_-]{8}\.js$/.test(url.pathname)
      const source = /^\/src\/(?:App\.tsx|ErrorReporting\.tsx|main\.tsx|whisper\.worker\.ts|lib\/(?:whisper-client|ffmpeg-audio|diagnostics)\.ts)$/.test(url.pathname)
      if ((!bundle && !source) || url.pathname.includes('..')) continue
      frames.push(`${bundle ? 'bundle' : 'src'}/${url.pathname.split('/').pop()}:${location[2]}:${location[3]}`)
      if (frames.length === 5) break
    } catch { /* Skip invalid locations. */ }
  }
  return frames
}

export function reportError(source: Source, value: unknown) {
  const error = value instanceof Error ? value : undefined
  if (error?.name === 'AbortError') return
  current = {
    source,
    context: { ...context },
    kind: error && errorKinds.has(error.name) ? error.name : 'Error',
    message: error && Object.hasOwn(safeMessages, error.message) ? safeMessages[error.message] : undefined,
    frames: error && typeof error.stack === 'string' ? safeFrames(error.stack, window.location.origin) : [],
  }
  listeners.forEach(listener => listener())
}

export function installErrorReporting() {
  window.addEventListener('error', event => {
    if (event instanceof ErrorEvent) reportError('window', event.error)
  })
  window.addEventListener('unhandledrejection', event => reportError('promise', event.reason))
}

function browserInfo(ua: string) {
  const browser = ua.match(/\b(Edg(?:A|iOS)?|OPR|FxiOS|Firefox|CriOS|Chrome|Version)\/(\d{1,4})/)
  const preferred = ua.match(/\b(Edg(?:A|iOS)?|OPR|FxiOS|CriOS)\/(\d{1,4})/) ?? browser
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : t.diagnosticUnknown
  return { browser: preferred ? (preferred[1] === 'Version' ? 'Safari' : preferred[1]) + ' ' + preferred[2] : t.diagnosticUnknown, os }
}

export function diagnosticText(report: Report, ua = navigator.userAgent, gpu = 'gpu' in navigator) {
  const { model, fileType, size, codec } = report.context
  const unknown = t.diagnosticUnknown
  const { browser, os } = browserInfo(ua)
  const sizeBucket = typeof size !== 'number' || !Number.isFinite(size) || size < 0 ? unknown :
    t.diagnosticSizes[size < 10e6 ? 0 : size < 100e6 ? 1 : size < 1e9 ? 2 : 3]
  const allowedCodec = /^(?:aac|mp3|opus|vorbis|flac|alaw|ulaw|ac-?3|e-?ac-?3|ec-3|dts(?:-hd)?|truehd|a_ac3|a_eac3|a_dts|pcm-(?:s|u|f)(?:8|16|24|32|64)(?:be|le)?)$/i
  return [
    t.diagnosticTitle + ' ' + __APP_VERSION__ + ' / ' + (__APP_COMMIT__ || unknown),
    t.diagnosticBrowser + ': ' + browser,
    t.diagnosticOs + ': ' + os,
    t.diagnosticWebGpu + ': ' + (gpu ? t.diagnosticYes : t.diagnosticNo),
    t.aiModel + ': ' + (/^(tiny|base|small)$/.test(model ?? '') ? model : unknown),
    t.diagnosticMedia + ': ' + (/^(mp4|mkv|webm|mov|mp3|m4a|wav|ogg)$/.test(fileType ?? '') ? fileType : unknown) + ', ' + sizeBucket,
    t.diagnosticCodec + ': ' + (codec && allowedCodec.test(codec) ? codec : unknown),
    t.diagnosticError + ': ' + t.diagnosticSources[report.source] + ' / ' + report.kind + ' / ' + (report.message ?? t.diagnosticRedacted),
    t.diagnosticStack + ': ' + (report.frames.length ? report.frames.join('\n') : unknown),
  ].join('\n')
}
