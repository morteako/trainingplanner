import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const errorBuffer: string[] = []

function reportFatalError(title: string, error: unknown) {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
      : typeof error === 'string'
        ? error
        : JSON.stringify(error)

  const entry = `[${new Date().toISOString()}] ${title}\n${message}`
  errorBuffer.push(entry)
  console.error(title, error)

  try {
    let panel = document.getElementById('fatal-error-log')
    if (!panel) {
      panel = document.createElement('pre')
      panel.id = 'fatal-error-log'
      panel.style.cssText =
        'position:fixed;inset:0;overflow:auto;padding:16px;margin:0;background:#111;color:#f6f6f6;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;z-index:2147483647;'
      panel.setAttribute('role', 'alert')
      document.body.appendChild(panel)
    }
    panel.textContent = errorBuffer.join('\n\n')
  } catch {}
}

window.addEventListener('error', (event) => {
  reportFatalError('Window error', event.error ?? event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  reportFatalError('Unhandled rejection', event.reason)
})

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (error) {
  reportFatalError('Render failure', error)
}
