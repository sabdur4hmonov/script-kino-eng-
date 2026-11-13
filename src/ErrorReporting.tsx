import { Component, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { FEEDBACK_URL } from './config'
import { uz as t } from './i18n/uz'
import { ThemeToggle } from './ThemeToggle'
import { clearDiagnostic, diagnosticText, getDiagnostic, reportError, subscribeDiagnostic } from './lib/diagnostics'

function ErrorReport({ retry }: { retry?: () => void }) {
  const report = useSyncExternalStore(subscribeDiagnostic, getDiagnostic)
  const [copied, setCopied] = useState<{ report: typeof report; status: 'copied' | 'manual' }>()
  const copy = copied && copied.report === report ? copied.status : 'idle'
  if (!report && !retry) return null
  const diagnostic = report ? diagnosticText(report) : ''

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(diagnostic)
      setCopied({ report, status: 'copied' })
    } catch {
      setCopied({ report, status: 'manual' })
    }
  }

  return (
    <section className="error-report panel">
      <p role="status">{t.unexpectedError}</p>
      <div className="error-actions">
        {report && <a className="button primary" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" onClick={() => void copyReport()}>{t.reportError}</a>}
        {retry && <button type="button" className="button" onClick={retry}>{t.aiRetry}</button>}
        {!retry && <button type="button" className="text-button" onClick={clearDiagnostic}>{t.close}</button>}
      </div>
      {copy !== 'idle' && <p role="status">{copy === 'copied' ? t.diagnosticPaste : t.diagnosticManual}</p>}
      {copy === 'manual' && <textarea aria-label={t.diagnosticTitle} className="dictation-input" readOnly value={diagnostic} rows={5} onFocus={event => event.currentTarget.select()} />}
    </section>
  )
}

export function PracticeArea({ children }: { children: ReactNode }) {
  return (
    <PracticeBoundary>
      <main>
        <ErrorReport />
        {children}
      </main>
    </PracticeBoundary>
  )
}

export class PracticeBoundary extends Component<{ children: ReactNode; shell?: boolean }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { reportError('react', error) }

  render() {
    if (!this.state.failed) return this.props.children
    const report = <ErrorReport retry={() => { clearDiagnostic(); this.setState({ failed: false }) }} />
    if (!this.props.shell) return <main>{report}</main>
    return (
      <div className="app-shell">
        <header className="site-header">
          <a className="brand" href="./">{t.brand}<strong>{t.brandAccent}</strong></a>
          <div className="header-actions"><ThemeToggle /></div>
        </header>
        <main>{report}</main>
        <footer><span>{t.footer}</span><a className="help-link" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">{t.feedback}</a></footer>
      </div>
    )
  }
}
