import { useEffect, useRef } from 'react'
import { uz as t } from './i18n/uz'

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      dialog.current.showModal()
      close.current?.focus()
    }
  }, [open])

  return (
    <dialog
      ref={dialog}
      id="app-help"
      className="help-dialog"
      aria-labelledby="help-title"
      onClose={onClose}
      onKeyDown={(event) => {
        // This plain-text dialog has one interactive control.
        if (event.key === 'Tab') {
          event.preventDefault()
          close.current?.focus()
        }
      }}
    >
      <div className="help-heading">
        <h2 id="help-title">{t.subtitleHelp}</h2>
        <button ref={close} className="button" onClick={() => dialog.current?.close()}>
          {t.close}
        </button>
      </div>
      <section>
        <h3>{t.helpEmbedded}</h3>
        <p>{t.helpEmbeddedBody}</p>
      </section>
      <section>
        <h3>{t.helpDownload}</h3>
        <p>{t.helpDownloadBody}</p>
        <p>{t.helpSync}</p>
      </section>
      <section>
        <h3>{t.helpMake}</h3>
        <h4>{t.helpSubtitleEdit}</h4>
        <ol>
          {t.helpSubtitleEditSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h4>{t.helpBuzz}</h4>
        <ol>
          {t.helpBuzzSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </dialog>
  )
}
