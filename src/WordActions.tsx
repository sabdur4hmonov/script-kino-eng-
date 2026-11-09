import { useId, useRef } from 'react'
import { uz as t } from './i18n/uz'

export function WordActions({
  word,
  count,
  speak,
}: {
  word: string
  count?: number
  speak: (word: string) => void
}) {
  const id = useId()
  const panel = useRef<HTMLSpanElement>(null)
  const lookup = word.replace(/[^\p{L}\p{N}\p{M}]/gu, '')
  if (!lookup) return <span>{word}</span>

  return (
    <span className="word-actions">
      <button
        type="button"
        popoverTarget={id}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          if (panel.current) {
            panel.current.style.left =
              Math.max(8, Math.min(rect.left, window.innerWidth - 208)) + 'px'
            panel.current.style.top =
              (rect.bottom + 52 < window.innerHeight
                ? rect.bottom + 4
                : Math.max(8, rect.top - 48)) + 'px'
          }
        }}
      >
        {word}
        {count !== undefined && <small>×{count}</small>}
      </button>
      <span
        id={id}
        ref={panel}
        popover="auto"
        className="word-popover"
        role="group"
        lang="uz"
        aria-label={t.wordActions}
      >
        <button type="button" onClick={() => speak(word)}>
          {t.pronunciation}
        </button>
        <a
          href={
            'https://translate.google.com/?sl=en&tl=uz&text=' +
            encodeURIComponent(lookup) +
            '&op=translate'
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.translation}
        </a>
      </span>
    </span>
  )
}
