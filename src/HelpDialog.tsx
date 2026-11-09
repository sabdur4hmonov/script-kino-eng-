import { useEffect, useRef } from 'react'
import { uz as t } from './i18n/uz'

export type HelpTopic = 'subtitles' | 'audio'

export function HelpDialog({ topic, onClose }: { topic: HelpTopic | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (topic && dialog.current && !dialog.current.open) {
      dialog.current.showModal()
      close.current?.focus()
    }
  }, [topic])

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
        <h2 id="help-title">{topic === 'audio' ? t.audioHelpTitle : t.subtitleHelp}</h2>
        <button ref={close} className="button" onClick={() => dialog.current?.close()}>
          {t.close}
        </button>
      </div>
      {topic === 'audio' ? (
        <>
          <section>
            <h3>{t.audioHelpHandbrake}</h3>
            <ol>
              {t.audioHelpHandbrakeSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
          <section>
            <h3>{t.audioHelpFfmpeg}</h3>
            <pre>
              <code>{t.audioHelpCommand}</code>
            </pre>
            <p>{t.audioHelpPreserve}</p>
          </section>
        </>
      ) : (
        <>
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
        </>
      )}
    </dialog>
  )
}
