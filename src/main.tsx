import '@fontsource-variable/inter'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/jetbrains-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PracticeBoundary } from './ErrorReporting'
import { loadAnalytics } from './lib/analytics'
import { installErrorReporting } from './lib/diagnostics'

installErrorReporting()
loadAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PracticeBoundary shell>
      <App />
    </PracticeBoundary>
  </StrictMode>,
)
