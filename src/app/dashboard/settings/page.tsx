'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Save, Loader2, Link2, Unlink } from 'lucide-react'

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const user = session?.user as any

  const searchParams = useSearchParams()
  const [emailNotif, setEmailNotif] = useState<boolean>(user?.emailNotificationsEnabled ?? false)
  const [minScoreNotif, setMinScoreNotif] = useState<number>(user?.minScoreEmailNotif ?? 50)
  const [name, setName] = useState<string>(user?.name || '')
  const [lang, setLang] = useState<string>(user?.preferredLanguage ?? 'Russian')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [hhConnected, setHhConnected] = useState<boolean>(false)
  const [hhEmployerId, setHhEmployerId] = useState<string | null>(null)
  const [hhLoading, setHhLoading] = useState<boolean>(true)
  const [hhDisconnecting, setHhDisconnecting] = useState<boolean>(false)

  useEffect(() => {
    async function fetchHhStatus() {
      try {
        const res = await fetch('/api/integrations/hh/status')
        if (res.ok) {
          const data = await res.json()
          setHhConnected(data.connected)
          setHhEmployerId(data.employerId)
        }
      } catch (err) {
        console.error('Failed to fetch hh integration status', err)
      } finally {
        setHhLoading(false)
      }
    }
    fetchHhStatus()
  }, [])

  useEffect(() => {
    const hhResult = searchParams.get('hh')
    if (hhResult === 'success') {
      setSaved(true)
      window.history.replaceState({}, document.title, window.location.pathname)
      setTimeout(() => setSaved(false), 3000)
    } else if (hhResult === 'error') {
      setError('Не удалось подключить ваш аккаунт HeadHunter. Пожалуйста, попробуйте еще раз.')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [searchParams])

  async function handleHhDisconnect() {
    if (!confirm('Вы уверены, что хотите отключить HeadHunter? Это разорвет связь со всеми связанными вакансиями.')) return
    setHhDisconnecting(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/hh/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error()
      setHhConnected(false)
      setHhEmployerId(null)
    } catch {
      setError('Не удалось отключить интеграцию с HeadHunter. Пожалуйста, попробуйте еще раз.')
    } finally {
      setHhDisconnecting(false)
    }
  }

  async function handleSave() {
    setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, emailNotificationsEnabled: emailNotif, minScoreEmailNotif: minScoreNotif, preferredLanguage: lang }),
      })
      if (!res.ok) throw new Error('Failed to save')
      await update({ name, emailNotificationsEnabled: emailNotif, minScoreEmailNotif: minScoreNotif, preferredLanguage: lang })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Не удалось сохранить настройки. Пожалуйста, попробуйте еще раз.')
    } finally {
      setSaving(false)
    }
  }

  const LANGUAGES = [
    { value: 'Russian', label: 'Русский' },
    { value: 'English', label: 'Английский' },
    { value: 'Kazakh', label: 'Казахский' },
    { value: 'Uzbek', label: 'Узбекский' },
    { value: 'Belarusian', label: 'Белорусский' },
    { value: 'Ukrainian', label: 'Украинский' },
    { value: 'German', label: 'Немецкий' },
    { value: 'French', label: 'Французский' },
    { value: 'Spanish', label: 'Испанский' },
    { value: 'Chinese', label: 'Китайский' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Настройки</h1>
          <p className="text-muted text-sm mt-2">Управляйте вашим профилем и настройками уведомлений</p>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 20 }}>{error}</div>}

      {/* Profile */}
      <div className="settings-section">
        <h2 className="settings-section-title">Профиль</h2>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Полное имя</div>
            <div className="settings-row-desc">Ваше имя, отображаемое в панели</div>
          </div>
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: 240 }}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ваше имя"
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Электронная почта</div>
            <div className="settings-row-desc">Используется для входа в аккаунт и уведомлений</div>
          </div>
          <span className="text-muted text-sm">{user?.email}</span>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Язык оценки ИИ</div>
            <div className="settings-row-desc">Язык, используемый ИИ для анализа резюме и составления саммари</div>
          </div>
          <select
            className="form-input"
            style={{ maxWidth: 240, cursor: 'pointer' }}
            value={lang}
            onChange={e => setLang(e.target.value)}
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* HeadHunter Integration */}
      <div className="settings-section">
        <h2 className="settings-section-title">Интеграции</h2>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">HeadHunter (hh.ru)</div>
            <div className="settings-row-desc">
              {hhLoading ? (
                'Загрузка статуса…'
              ) : hhConnected ? (
                <>Подключено {hhEmployerId && `(ID Работодателя: ${hhEmployerId})`}</>
              ) : (
                'Подключите ваш аккаунт HeadHunter для связывания и синхронизации вакансий'
              )}
            </div>
          </div>
          {!hhLoading && (
            hhConnected ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)', gap: 5 }}
                onClick={handleHhDisconnect}
                disabled={hhDisconnecting}
              >
                {hhDisconnecting ? <Loader2 size={13} className="spin" /> : <Unlink size={13} />}
                Отключить
              </button>
            ) : (
              <a
                href="/api/integrations/hh/authorize"
                className="btn btn-secondary btn-sm"
                style={{ gap: 5 }}
              >
                <Link2 size={13} />
                Подключить аккаунт
              </a>
            )
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-section">
        <h2 className="settings-section-title">Уведомления</h2>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Email-уведомления</div>
            <div className="settings-row-desc">
              Получать уведомления на email o новых откликах
            </div>
          </div>
          <label className="toggle" style={{ flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={emailNotif}
              onChange={e => setEmailNotif(e.target.disabled)}
            />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </label>
        </div>

        {emailNotif && (
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Порог оценки для email</div>
              <div className="settings-row-desc">
                Получать email-уведомления только о кандидатах с оценкой не ниже указанной
              </div>
            </div>
            <select
              className="form-input"
              style={{ maxWidth: 180, cursor: 'pointer' }}
              value={minScoreNotif}
              onChange={e => setMinScoreNotif(Number(e.target.value))}
            >
              {[95, 90, 85, 80, 75, 70, 65, 60, 55, 50].map(val => (
                <option key={val} value={val}>{val}%</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
        {saved && <span className="text-sm" style={{ color: 'var(--color-success)' }}>✓ Успешно сохранено</span>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 size={15} className="spin" /> Сохранение…</> : <><Save size={15} /> Сохранить</>}
        </button>
      </div>
    </div>
  )
}
