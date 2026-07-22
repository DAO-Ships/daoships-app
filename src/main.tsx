import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import { validateContractConfig } from '@/config/contracts'
import { useUiStore } from '@/store/uiStore'

/**
 * Render a plain-DOM failure page.
 *
 * validateContractConfig() throws in PROD on bad configuration, and it runs BEFORE
 * createRoot().render(). #root has no fallback markup and the ErrorBoundary lives
 * inside <App>, so an unhandled throw here produced a permanently blank page with no
 * indication of what went wrong. This cannot use React — React is exactly what has
 * not started yet.
 */
function renderStartupFailure(message: string) {
  const root = document.getElementById('root')
  if (!root) return

  const wrap = document.createElement('div')
  wrap.setAttribute(
    'style',
    'min-height:100vh;display:flex;align-items:center;justify-content:center;'
    + 'padding:24px;font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0a12;color:#f3f4f6',
  )
  const card = document.createElement('div')
  card.setAttribute('style', 'max-width:36rem;text-align:left')

  const h = document.createElement('h1')
  h.setAttribute('style', 'font-size:1.125rem;font-weight:600;margin:0 0 8px')
  h.textContent = 'DAOShips could not start'

  const p = document.createElement('p')
  p.setAttribute('style', 'font-size:0.875rem;color:#9ca3af;margin:0 0 12px')
  p.textContent =
    'The app is misconfigured for this deployment, so it stopped rather than run '
    + 'against the wrong network or missing contracts.'

  // textContent, never innerHTML — the message can include env-derived values.
  const pre = document.createElement('pre')
  pre.setAttribute(
    'style',
    'font-size:0.75rem;white-space:pre-wrap;word-break:break-word;background:#1a1a2e;'
    + 'border:1px solid #2a2a44;border-radius:8px;padding:12px;margin:0;color:#fca5a5',
  )
  pre.textContent = message

  card.append(h, p, pre)
  wrap.append(card)
  root.append(wrap)
}

try {
  // Validate contract configuration at startup
  validateContractConfig()

  // Initialize theme before render to prevent flash of unstyled content
  useUiStore.getState().initializeTheme()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
} catch (err) {
  console.error('[DAOShips] Startup failed:', err)
  renderStartupFailure(err instanceof Error ? err.message : String(err))
}
