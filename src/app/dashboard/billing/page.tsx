'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Check, Loader2, Shield, AlertTriangle } from 'lucide-react'

const DURATIONS = [
  { key: '1m', label: 'Monthly', months: 1, saving: null },
  { key: '1y', label: 'Annual', months: 12, saving: 'Save 30%' },
] as const

const PLANS = [
  {
    key: 'basic',
    name: 'Basic (Free)',
    limit: '10 active vacancies',
    features: ['Up to 10 active vacancies', 'AI CV matching & scoring', 'Candidate management', 'Email notifications', 'On-demand CV generation'],
    prices: { '1m': 0, '1y': 0 },
    recommended: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    limit: '30 active vacancies',
    features: [
      'Up to 30 active vacancies',
      'AI CV matching & scoring',
      'Candidate management',
      'Email notifications',
      'On-demand CV generation',
      'Priority support',
      'Export candidates to CSV (Pro)',
      'Share candidate by link (Pro)',
      'Auto replies for candidates (Pro)',
      'Custom branding (Pro)',
    ],
    prices: { '1m': 299, '1y': 2499 },
    recommended: true,
  },
] as const

function BillingContent() {
  const { data: session } = useSession()
  const _searchParams = useSearchParams()

  const user = session?.user as any
  const currentTier = user?.subscriptionTier?.toLowerCase() || 'basic'
  const subEndsAt = user?.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null
  const now = new Date()

  const [duration, setDuration] = useState<'1m' | '1y'>('1m')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function handlePurchase(planKey: string) {
    setError('')
    const fullKey = `${planKey}_${duration}`
    setLoading(fullKey)
    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey: fullKey }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Payment failed')
      // Redirect to YooKassa confirmation URL
      window.location.href = data.confirmationUrl
    } catch (e: any) {
      setError(e.message || 'Failed to initiate payment. Please try again.')
      setLoading(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Billing & Plans</h1>
        <p className="text-muted text-sm mt-2">
          {currentTier === 'pro' && subEndsAt && subEndsAt > now
            ? `Current plan: PRO. Active until ${subEndsAt.toLocaleDateString()}.`
            : currentTier === 'pro'
              ? 'Your PRO subscription has expired. You are now on the BASIC Free plan.'
              : 'Current plan: BASIC (Free).'}
        </p>
      </div>

      {error && (
        <div className="auth-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Duration selector */}
      <div className="mb-6">
        <p className="section-title mb-3">Billing period</p>
        <div className="duration-tabs" style={{ maxWidth: 360 }}>
          {DURATIONS.map(d => (
            <button
              key={d.key}
              className={`duration-tab${duration === d.key ? ' active' : ''}`}
              onClick={() => setDuration(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="billing-grid">
        {PLANS.map(plan => {
          const price = plan.prices[duration]
          const isCurrent = plan.key === 'basic'
            ? currentTier === 'basic'
            : currentTier === 'pro' && subEndsAt && subEndsAt > now
          const planLoadingKey = `${plan.key}_${duration}`

          return (
            <div key={plan.key} className={`plan-card${plan.recommended ? ' recommended' : ''}`}>
              {plan.recommended && <span className="plan-badge">Most Popular</span>}

              <div>
                <div className="plan-name">{plan.name}</div>
                <div className="plan-limit">{plan.limit}</div>
              </div>

              <div className="plan-price-row">
                {price === 0 ? (
                  <span className="plan-price">Free</span>
                ) : (
                  <>
                    <span className="plan-currency">₽</span>
                    <span className="plan-price">{price.toLocaleString('ru')}</span>
                    <span className="plan-period">/ {DURATIONS.find(d => d.key === duration)?.label.toLowerCase()}</span>
                  </>
                )}
              </div>

              <ul className="plan-features">
                {plan.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>

              <button
                className={`btn btn-full${plan.recommended ? ' btn-primary' : ' btn-secondary'}`}
                disabled={plan.key === 'basic' || !!isCurrent || loading === planLoadingKey}
                onClick={() => handlePurchase(plan.key)}
              >
                {loading === planLoadingKey
                  ? <><Loader2 size={15} className="spin" /> Processing…</>
                  : plan.key === 'basic'
                    ? <><Check size={15} /> Current Plan</>
                    : isCurrent
                      ? <><Check size={15} /> Current Plan</>
                      : `Pay ₽${price.toLocaleString('ru')}`
                }
              </button>
            </div>
          )
        })}
      </div>

      {/* Trust indicators */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 24, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Shield size={14} /> Payments via YooKassa</span>
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="spinner" />}>
      <BillingContent />
    </Suspense>
  )
}
