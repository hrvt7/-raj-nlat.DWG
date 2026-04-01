import './sentry.js'  // Initialize Sentry before anything else
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ── Client-facing quote portal route: /q/:token ───────────────────────────────
const QuotePortal = lazy(() => import('./pages/QuotePortal.jsx'))

const path = window.location.pathname
const quoteMatch = path.match(/^\/q\/([a-f0-9]{64})$/)

const root = ReactDOM.createRoot(document.getElementById('root'))

if (quoteMatch) {
  const token = quoteMatch[1]
  root.render(
    <React.StrictMode>
      <Suspense fallback={null}>
        <QuotePortal token={token} />
      </Suspense>
    </React.StrictMode>
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
