'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Check, Loader2, Shield, AlertTriangle } from 'lucide-react'

const DURATIONS = [
  { key: '1m', label: 'В месяц', months: 1, saving: null },
  { key: '1y', label: 'В год', months: 12, saving: 'Скидка 30%' },
] as const

const PLANS = [
  {
    key: 'basic',
    name: 'Базовый (Бесплатно)',
    limit: '10 активных вакансий',
    features: ['До 10 активных вакансий', 'Интеграция c hh.ru', 'ИИ-подбор и оценка резюме', 'Email-уведомления (временно не работает)', 'Генерация фала с резюме'],
    prices: { '1m': 0, '1y': 0 },
    recommended: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    limit: '30 активных вакансий',
    features: [
      'До 30 активных вакансий',
      'Интеграция c hh.ru',
      'ИИ-подбор и оценка резюме',
      'Email-уведомления (временно не работает)',
      'Генерация фала с резюме',
      'Приоритетная поддержка (Pro)',
      'Экспорт кандидатов в CSV (Pro)',
      'Автоответы кандидатам (Pro)',
      'Кастомный брендинг (Pro)',
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
      if (!res.ok) throw new Error(data.error || 'Оплата не удалась')
      // Redirect to YooKassa confirmation URL
      window.location.href = data.confirmationUrl
    } catch (e: any) {
      setError(e.message || 'Не удалось инициировать оплату. Пожалуйста, попробуйте еще раз.')
      setLoading(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Тарифы и оплата</h1>
        <p className="text-muted text-sm mt-2">
          {currentTier === 'pro' && subEndsAt && subEndsAt > now
            ? `Текущий тариф: PRO. Активен до ${subEndsAt.toLocaleDateString()}.`
            : currentTier === 'pro'
              ? 'Ваша PRO-подписка истекла. Вы переведены на бесплатный тариф БАЗОВЫЙ.'
              : 'Текущий тариф: БАЗОВЫЙ (Бесплатный).'}
        </p>
      </div>

      {error && (
        <div className="auth-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Duration selector */}
      <div className="mb-6" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <p className="section-title" style={{ margin: 0 }}>Период оплаты</p>
        <div className="duration-tabs" style={{ maxWidth: 280, flex: '1 1 200px' }}>
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
              {plan.recommended && <span className="plan-badge">Популярный</span>}

              <div>
                <div className="plan-name">{plan.name}</div>
                <div className="plan-limit">{plan.limit}</div>
              </div>

              <div className="plan-price-row">
                {price === 0 ? (
                  <span className="plan-price">Бесплатно</span>
                ) : (
                  <>
                    <span className="plan-price">{price.toLocaleString('ru')}</span>
                    <span className="plan-currency"> ₽</span>
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
                  ? <><Loader2 size={15} className="spin" /> Обработка…</>
                  : plan.key === 'basic'
                    ? <><Check size={15} /> Текущий тариф</>
                    : isCurrent
                      ? <><Check size={15} /> Текущий тариф</>
                      : `Оплатить ${price.toLocaleString('ru')} ₽`
                }
              </button>
            </div>
          )
        })}
      </div>

      {/* Trust indicators */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 24, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Shield size={14} /> Платежи через ЮKassa</span>
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
