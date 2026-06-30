'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

function SuccessContent() {
  const params = useSearchParams()
  const router = useRouter()
  const planKey = params.get('planKey') || ''

  useEffect(() => {
    const timer = setTimeout(() => router.push('/dashboard'), 4000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', gap: 16 }}>
      <CheckCircle size={56} style={{ color: 'var(--color-success)' }} />
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Payment Successful!</h1>
      <p className="text-muted">
        Your <strong>{planKey.replace(/_/g, ' ').toUpperCase()}</strong> plan is now active.
      </p>
      <p className="text-sm text-muted">Redirecting to dashboard in a moment…</p>
      <button className="btn btn-primary" onClick={() => router.push('/dashboard')}>
        Go to Dashboard
      </button>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return <Suspense fallback={<div className="spinner" />}><SuccessContent /></Suspense>
}
