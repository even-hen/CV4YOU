'use client'

import { AlertTriangle } from 'lucide-react'

export default function DashboardError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '50vh', gap: 16, padding: 24,
      textAlign: 'center',
    }}>
      <AlertTriangle size={48} style={{ color: 'var(--color-danger)' }} />
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Something went wrong</h2>
      <p style={{ color: 'var(--color-text-muted)', maxWidth: 400 }}>
        An unexpected error occurred. Please try again or contact support if the problem persists.
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  )
}
