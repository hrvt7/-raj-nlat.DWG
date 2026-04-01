import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Only send errors in production/preview — skip in local dev
    enabled: import.meta.env.PROD,
    // Sample 100% of errors, 10% of transactions (performance)
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    // Ignore common non-actionable browser errors
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection',
      'Load failed',
      'Failed to fetch',
      'NetworkError',
      'ChunkLoadError',
    ],
  })
}

export { Sentry }
