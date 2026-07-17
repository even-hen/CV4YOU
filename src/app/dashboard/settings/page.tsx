'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Save, Loader2, Link2, Unlink } from 'lucide-react'

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const user = session?.user as any

  const searchParams = useSearchParams()
  const [emailNotif, setEmailNotif] = useState<boolean>(user?.emailNotificationsEnabled ?? true)
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
      setError('Failed to connect your HeadHunter account. Please try again.')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [searchParams])

  async function handleHhDisconnect() {
    if (!confirm('Are you sure you want to disconnect HeadHunter? This will unlink all mapped vacancies.')) return
    setHhDisconnecting(true)
    setError('')
    try {
      const res = await fetch('/api/integrations/hh/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error()
      setHhConnected(false)
      setHhEmployerId(null)
    } catch {
      setError('Failed to disconnect HeadHunter integration. Please try again.')
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
      setError('Failed to save settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Settings</h1>
          <p className="text-muted text-sm mt-2">Manage your profile and notification preferences</p>
        </div>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 20 }}>{error}</div>}

      {/* Profile */}
      <div className="settings-section">
        <h2 className="settings-section-title">Profile</h2>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Full name</div>
            <div className="settings-row-desc">Your display name in the dashboard</div>
          </div>
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: 240 }}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Email address</div>
            <div className="settings-row-desc">Used for account login and notifications</div>
          </div>
          <span className="text-muted text-sm">{user?.email}</span>
        </div>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">AI evaluation language</div>
            <div className="settings-row-desc">Language used by AI to analyze CVs and write summaries</div>
          </div>
          <select
            className="form-input"
            style={{ maxWidth: 240, cursor: 'pointer' }}
            value={lang}
            onChange={e => setLang(e.target.value)}
          >
            {['Russian', 'English', 'Kazakh', 'Uzbek', 'Belarusian', 'Ukrainian', 'German', 'French', 'Spanish', 'Chinese'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-section">
        <h2 className="settings-section-title">Notifications</h2>

        <div className="settings-row">
          <div>
            <div className="settings-row-label">Email notifications</div>
            <div className="settings-row-desc">
              Receive an email when a new candidate submits an application
            </div>
          </div>
          <label className="toggle" style={{ flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={emailNotif}
              onChange={e => setEmailNotif(e.target.checked)}
            />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </label>
        </div>

        {emailNotif && (
          <div className="settings-row">
            <div>
              <div className="settings-row-label">Email score threshold</div>
              <div className="settings-row-desc">
                Only receive email alerts for applications with a score at or above this level
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

      {/* Subscription info */}
      <div className="settings-section">
        <h2 className="settings-section-title">Subscription</h2>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Current plan</div>
            <div className="settings-row-desc">
              {user?.subscriptionTier === 'PRO' ? 'Pro Plan — up to 30 active vacancies' : 'Basic Plan — up to 10 active vacancies'}
            </div>
          </div>
          <a href="/dashboard/billing" className="btn btn-secondary btn-sm">Manage billing</a>
        </div>
      </div>

      {/* HeadHunter Integration */}
      <div className="settings-section">
        <h2 className="settings-section-title">Integrations</h2>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">HeadHunter (hh.ru)</div>
            <div className="settings-row-desc">
              {hhLoading ? (
                'Loading status…'
              ) : hhConnected ? (
                <>Connected {hhEmployerId && `(Employer ID: ${hhEmployerId})`}</>
              ) : (
                'Connect your HeadHunter account to link and sync vacancies'
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
                Disconnect
              </button>
            ) : (
              <a
                href="/api/integrations/hh/authorize"
                className="btn btn-secondary btn-sm"
                style={{ gap: 5 }}
              >
                <Link2 size={13} />
                Connect account
              </a>
            )
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
        {saved && <span className="text-sm" style={{ color: 'var(--color-success)' }}>✓ Saved successfully</span>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 size={15} className="spin" /> Saving…</> : <><Save size={15} /> Save</>}
        </button>
      </div>
    </div>
  )
}
