'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Check, Loader2, Shield, CreditCard, AlertTriangle } from 'lucide-react'

const DURATIONS = [
  { key: '1m', label: '1 Month', months: 1, saving: null },
  { key: '3m', label: '3 Months', months: 3, saving: 'Save 11%' },
  { key: '1y', label: '1 Year', months: 12, saving: 'Save 28%' },
] as const

const PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    limit: '10 active vacancies',
    features: ['Up to 10 active vacancies', 'AI CV matching & scoring', 'Candidate management', 'Email notifications', 'On-demand CV generation'],
    prices: { '1m': 1490, '3m': 3990, '1y': 12990 },
    recommended: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    limit: '30 active vacancies',
    features: ['Up to 30 active vacancies', 'AI CV matching & scoring', 'Candidate management', 'Email notifications', 'On-demand CV generation', 'Priority support'],
    prices: { '1m': 2990, '3m': 7990, '1y': 24990 },
    recommended: true,
  },
] as const

function BillingContent() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const defaultPlan = searchParams.get('plan') === 'pro' ? 'pro' : 'basic'

  const user = session?.user as any
  const currentTier = user?.subscriptionTier?.toLowerCase() || 'basic'
  const subEndsAt = user?.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null
  const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt) : null
  const now = new Date()
  const inTrial = trialEndsAt && trialEndsAt > now && (!subEndsAt || subEndsAt <= now)

  const [duration, setDuration] = useState<'1m' | '3m' | '1y'>('1m')
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
          {inTrial
            ? `You are on a free trial. Trial ends ${trialEndsAt!.toLocaleDateString()}.`
            : subEndsAt && subEndsAt > now
              ? `Current plan: ${currentTier.toUpperCase()}. Active until ${subEndsAt.toLocaleDateString()}.`
              : 'Your access has expired. Choose a plan to continue.'}
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
              {d.saving && <span style={{ fontSize: '0.6875rem', marginLeft: 4, color: 'var(--color-success)' }}>{d.saving}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="billing-grid">
        {PLANS.map(plan => {
          const price = plan.prices[duration]
          const isCurrent = currentTier === plan.key && subEndsAt && subEndsAt > now
          const planLoadingKey = `${plan.key}_${duration}`

          return (
            <div key={plan.key} className={`plan-card${plan.recommended ? ' recommended' : ''}`}>
              {plan.recommended && <span className="plan-badge">Most Popular</span>}

              <div>
                <div className="plan-name">{plan.name}</div>
                <div className="plan-limit">{plan.limit}</div>
              </div>

              <div className="plan-price-row">
                <span className="plan-currency">₽</span>
                <span className="plan-price">{price.toLocaleString('ru')}</span>
                <span className="plan-period">/ {DURATIONS.find(d => d.key === duration)?.label.toLowerCase()}</span>
              </div>

              <ul className="plan-features">
                {plan.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>

              <button
                className={`btn btn-full${plan.recommended ? ' btn-primary' : ' btn-secondary'}`}
                disabled={!!isCurrent || loading === planLoadingKey}
                onClick={() => handlePurchase(plan.key)}
              >
                {loading === planLoadingKey
                  ? <><Loader2 size={15} className="spin" /> Processing…</>
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
