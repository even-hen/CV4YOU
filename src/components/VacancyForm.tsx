'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Loader2, ArrowLeft,
  Check, Info, Archive, Link2,
  HelpCircle, Briefcase, Globe, Copy, AlertTriangle
} from 'lucide-react'

export interface KOQuestion {
  question: string
  options: string[]
  correctAnswer: number
}

export interface VacancyFormData {
  company: string
  role: string
  responsibilities: string
  baseRequirements: string
  mandatoryRequirements: string
  niceToHave: string
  requestedContacts: string[]
  salaryExpectation: string
  knockoutQuestions: KOQuestion[]
  linkEnabled: boolean
  isActive?: boolean
  hhVacancyId?: string | null
  hhVacancyTitle?: string | null
  hhSyncEnabled?: boolean
}

const EMPTY_FORM: VacancyFormData = {
  company: '',
  role: '',
  responsibilities: '',
  baseRequirements: '',
  mandatoryRequirements: '',
  niceToHave: '',
  requestedContacts: [],
  salaryExpectation: '',
  knockoutQuestions: [],
  linkEnabled: true,
  isActive: true,
  hhVacancyId: null,
  hhVacancyTitle: null,
  hhSyncEnabled: true,
}


const CONTACT_OPTIONS = [
  { key: 'phone', label: 'Phone number' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'email', label: 'Email address' },
]

const SALARY_OPTIONS = [
  { value: '', label: 'Not asked' },
  { value: 'optional', label: 'Optional' },
  { value: 'required', label: 'Required' },
]

interface VacancyFormProps {
  initialData?: VacancyFormData
  vacancyId?: string
  mode: 'create' | 'edit'
}

export default function VacancyForm({ initialData, vacancyId, mode }: VacancyFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<VacancyFormData>(initialData || EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [error, setError] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)

  const [hhConnected, setHhConnected] = useState(false)
  const [hhVacancies, setHhVacancies] = useState<{ id: string; name: string }[]>([])
  const [loadingHh, setLoadingHh] = useState(true)

  useEffect(() => {
    async function checkHhIntegration() {
      try {
        const statusRes = await fetch('/api/integrations/hh/status')
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          if (statusData.connected) {
            setHhConnected(true)
            const vacanciesRes = await fetch('/api/integrations/hh/vacancies')
            if (vacanciesRes.ok) {
              const vacanciesData = await vacanciesRes.json()
              setHhVacancies(vacanciesData.vacancies || [])
            }
          }
        }
      } catch (err) {
        console.error('Failed to load HeadHunter integration:', err)
      } finally {
        setLoadingHh(false)
      }
    }
    checkHhIntegration()
  }, [])


  async function handleArchive() {
    if (!vacancyId) return
    setArchiving(true)
    try {
      const res = await fetch(`/api/vacancies/${vacancyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (res.ok) {
        router.push('/dashboard/vacancies')
      } else {
        setError('Failed to archive vacancy')
      }
    } catch {
      setError('Network error archiving vacancy')
    } finally {
      setArchiving(false)
      setConfirmArchive(false)
    }
  }

  function update<K extends keyof VacancyFormData>(key: K, value: VacancyFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleContact(key: string) {
    const current = form.requestedContacts
    update('requestedContacts', current.includes(key) ? current.filter(c => c !== key) : [...current, key])
  }

  // Knockout question helpers
  function addKO() {
    update('knockoutQuestions', [...form.knockoutQuestions, { question: '', options: ['', ''], correctAnswer: 0 }])
  }

  function removeKO(i: number) {
    update('knockoutQuestions', form.knockoutQuestions.filter((_, idx) => idx !== i))
  }

  function updateKO(i: number, partial: Partial<KOQuestion>) {
    const next = form.knockoutQuestions.map((q, idx) => idx === i ? { ...q, ...partial } : q)
    update('knockoutQuestions', next)
  }

  function addOption(qi: number) {
    const next = form.knockoutQuestions.map((q, idx) =>
      idx === qi ? { ...q, options: [...q.options, ''] } : q
    )
    update('knockoutQuestions', next)
  }

  function removeOption(qi: number, oi: number) {
    const next = form.knockoutQuestions.map((q, idx) => {
      if (idx !== qi) return q
      const opts = q.options.filter((_, oidx) => oidx !== oi)
      let newCorrect = Number(q.correctAnswer) || 0
      if (newCorrect === oi) newCorrect = 0
      else if (newCorrect > oi) newCorrect = newCorrect - 1
      return { ...q, options: opts, correctAnswer: newCorrect }
    })
    update('knockoutQuestions', next)
  }

  function updateOption(qi: number, oi: number, val: string) {
    const next = form.knockoutQuestions.map((q, idx) => {
      if (idx !== qi) return q
      const options = q.options.map((o, oidx) => oidx === oi ? val : o)
      return { ...q, options }
    })
    update('knockoutQuestions', next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    // Validate KO questions
    for (const q of form.knockoutQuestions) {
      if (!q.question.trim()) { setError('All knockout questions must have a question text.'); setSaving(false); return }
      if (q.options.filter(o => o.trim()).length < 2) { setError('Each question must have at least 2 options.'); setSaving(false); return }
      if (q.correctAnswer === undefined || q.correctAnswer < 0 || q.correctAnswer >= q.options.length) { setError('Each question must have a correct answer selected.'); setSaving(false); return }
    }

    try {
      const payload = {
        ...form,
        knockoutQuestions: form.knockoutQuestions.map(q => ({
          ...q,
          options: q.options.filter(o => o.trim()),
        })),
      }

      let res: Response
      if (mode === 'create') {
        res = await fetch('/api/vacancies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch(`/api/vacancies/${vacancyId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      const data = await res.json()

      if (!res.ok) {
        if (data.limitReached) {
          setError(`You've reached your active vacancy limit. Upgrade to Pro for up to 30 vacancies.`)
        } else {
          setError(data.error || 'Failed to save vacancy.')
        }
        setSaving(false)
        return
      }

      router.push('/dashboard/vacancies')
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  const linkUrl = vacancyId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/jobs/${vacancyId}` : null

  async function copyLink() {
    if (!linkUrl) return
    await navigator.clipboard.writeText(linkUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2500)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.back()} style={{ gap: 5 }}>
          <ArrowLeft size={15} /> Back
        </button>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800 }}>
          {mode === 'create' ? 'New Vacancy' : 'Edit Vacancy'}
        </h1>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 20 }}>{error}</div>}

      <form onSubmit={handleSubmit} className="vacancy-form">

        {/* Basic Info */}
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Company *</label>
            <input className="form-input" placeholder="e.g. Acme Corp" value={form.company}
              onChange={e => update('company', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Role / Job Title *</label>
            <input className="form-input" placeholder="e.g. Senior Frontend Developer" value={form.role}
              onChange={e => update('role', e.target.value)} required />
          </div>
        </div>

        {/* Responsibilities */}
        <div className="form-group">
          <label className="form-label">Responsibilities</label>
          <textarea className="form-textarea" style={{ minHeight: 150 }}
            placeholder="Describe what the candidate will be doing…"
            value={form.responsibilities}
            onChange={e => update('responsibilities', e.target.value)}
          />
        </div>

        {/* Base Requirements */}
        <div className="form-group">
          <label className="form-label">
            Base Requirements *
            <span className="form-label-hint"> — standard evaluation</span>
          </label>
          <textarea className="form-textarea" style={{ width: '100%', minHeight: 150 }}
            placeholder="Skills and experience expected from most candidates…"
            value={form.baseRequirements}
            onChange={e => update('baseRequirements', e.target.value)}
            required
          />
        </div>

        {/* Mandatory Requirements + Nice to Have side-by-side */}
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">
              Mandatory Requirements
              <span className="form-label-hint"> — highest evaluation (optional)</span>
            </label>
            <textarea className="form-textarea" style={{ width: '100%', minHeight: 150 }}
              placeholder="Must-have skills. Missing these heavily lowers score…"
              value={form.mandatoryRequirements}
              onChange={e => update('mandatoryRequirements', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Nice to Have</label>
            <textarea className="form-textarea" style={{ width: '100%', minHeight: 150 }}
              placeholder="Bonus skills or experience (optional)…"
              value={form.niceToHave}
              onChange={e => update('niceToHave', e.target.value)}
            />
          </div>
        </div>

        <div className="divider" />

        {/* Salary expectation — on top of Contacts */}
        <div className="form-group">
          <label className="form-label">Salary Expectation</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {SALARY_OPTIONS.map(o => (
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: form.salaryExpectation === o.value ? 'var(--color-primary-dim)' : 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: `1px solid ${form.salaryExpectation === o.value ? 'var(--color-primary)' : 'var(--color-border)'}`, cursor: 'pointer', transition: 'all var(--transition)', fontSize: '0.875rem' }}>
                <input type="radio" name="salary" value={o.value} checked={form.salaryExpectation === o.value} onChange={() => update('salaryExpectation', o.value)} style={{ accentColor: 'var(--color-primary)' }} />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        {/* Contact fields */}
        <div>
          <p className="form-label" style={{ marginBottom: 10 }}>Request Contact Information</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {CONTACT_OPTIONS.map(c => (
              <label key={c.key} className="checkbox-group" style={{ padding: '8px 14px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: `1px solid ${form.requestedContacts.includes(c.key) ? 'var(--color-primary)' : 'var(--color-border)'}`, cursor: 'pointer', transition: 'all var(--transition)' }}>
                <input type="checkbox" checked={form.requestedContacts.includes(c.key)} onChange={() => toggleContact(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        {/* Knockout Questions Card */}
        <div className="form-card">
          <div className="form-card-header">
            <div className="form-card-title-block">
              <HelpCircle className="form-card-title-icon" size={20} />
              <h3 className="form-card-title">Knockout Questions</h3>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addKO} style={{ gap: 6 }}>
              <Plus size={14} /> Add question
            </button>
          </div>

          <div className="form-card-body">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: 'var(--color-warning-dim)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-warning)' }}>
              <AlertTriangle size={15} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 3 }} />
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Candidates failing these questions are automatically filtered out. They are presented as "Additional Questions" on the candidate submission form.
              </p>
            </div>

            {form.knockoutQuestions.length === 0 ? (
              <div className="empty-state-dashed">
                <HelpCircle size={32} style={{ color: 'var(--color-text-subtle)', opacity: 0.6 }} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 2 }}>No knockout questions configured</p>
                  <p className="text-xs text-muted">Add multiple-choice questions to automatically filter unqualified candidates.</p>
                </div>
                <button type="button" className="btn btn-secondary btn-xs" onClick={addKO}>
                  + Create First Question
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {form.knockoutQuestions.map((q, qi) => (
                  <div key={qi} className="ko-question-item">
                    <div className="flex items-center justify-between gap-2">
                      <label className="form-label" style={{ margin: 0 }}>Question {qi + 1}</label>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => removeKO(qi)}>
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <input
                      className="form-input"
                      placeholder="e.g. Do you have experience with React?"
                      value={q.question}
                      onChange={e => updateKO(qi, { question: e.target.value })}
                    />

                    <div className="ko-options-list">
                      <p className="text-xs text-muted" style={{ marginBottom: 4 }}>Answer options (select the correct one):</p>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="ko-option-row">
                          <input
                            type="radio"
                            name={`correct-${qi}`}
                            checked={Number(q.correctAnswer) === oi}
                            onChange={() => updateKO(qi, { correctAnswer: oi })}
                            title="Mark as correct answer"
                            style={{ accentColor: 'var(--color-success)', flexShrink: 0 }}
                          />
                          <input
                            className="form-input ko-option-input"
                            placeholder={`Option ${oi + 1}`}
                            value={opt}
                            onChange={e => updateOption(qi, oi, e.target.value)}
                          />
                          {q.options.length > 2 && (
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)', padding: 4 }} onClick={() => removeOption(qi, oi)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', fontSize: '0.8125rem' }} onClick={() => addOption(qi)}>
                        <Plus size={13} /> Add option
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* HeadHunter Integration Card */}
        {!loadingHh && hhConnected && (
          <div className="form-card">
            <div className="form-card-header">
              <div className="form-card-title-block">
                <Briefcase className="form-card-title-icon" size={20} />
                <h3 className="form-card-title">HeadHunter Integration</h3>
              </div>
              <span style={{ background: 'var(--color-success-dim)', color: 'var(--color-success)', fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                Connected
              </span>
            </div>

            <div className="form-card-body">
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Link this vacancy to an active posting on hh.ru. CV4YOU will automatically fetch, process, and score incoming applicants.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="select-wrapper">
                    <select
                      className="form-input"
                      style={{ cursor: 'pointer', width: '100%' }}
                      value={form.hhVacancyId || ''}
                      onChange={e => {
                        const selectedId = e.target.value
                        const v = hhVacancies.find(x => x.id === selectedId)
                        update('hhVacancyId', selectedId || null)
                        update('hhVacancyTitle', v ? v.name : null)
                        if (selectedId) update('hhSyncEnabled', true)
                      }}
                    >
                      <option value="">-- Mapped hh.ru Vacancy --</option>
                      {hhVacancies.map(v => (
                        <option key={v.id} value={v.id}>{v.name} (ID: {v.id})</option>
                      ))}
                    </select>
                  </div>
                  {form.hhVacancyId && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
                      onClick={() => {
                        update('hhVacancyId', null)
                        update('hhVacancyTitle', null)
                        update('hhSyncEnabled', false)
                      }}
                    >
                      Disconnect Link
                    </button>
                  )}
                </div>

                {form.hhVacancyId && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: 4 }}>
                    <div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Sync Active</span>
                      <p className="text-xs text-muted" style={{ margin: 0 }}>Import candidates automatically in the background</p>
                    </div>
                    <label className="toggle-wrapper" style={{ flexShrink: 0 }}>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={form.hhSyncEnabled ?? true}
                          onChange={e => update('hhSyncEnabled', e.target.checked)}
                        />
                        <span className="toggle-track" />
                        <span className="toggle-thumb" />
                      </label>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Candidate Application Link Card */}
        <div className="form-card">
          <div className="form-card-header">
            <div className="form-card-title-block">
              <Globe className="form-card-title-icon" size={20} />
              <h3 className="form-card-title">Candidate Application Link</h3>
            </div>
            <label className="toggle-wrapper" style={{ flexShrink: 0, opacity: form.isActive === false ? 0.5 : 1, cursor: form.isActive === false ? 'not-allowed' : 'pointer' }}>
              <label className="toggle" style={{ cursor: form.isActive === false ? 'not-allowed' : 'pointer' }}>
                <input type="checkbox" checked={form.linkEnabled} disabled={form.isActive === false} onChange={e => update('linkEnabled', e.target.checked)} />
                <span className="toggle-track" />
                <span className="toggle-thumb" />
              </label>
              <span style={{ fontSize: '0.875rem', color: form.linkEnabled && form.isActive !== false ? 'var(--color-success)' : 'var(--color-text-muted)', fontWeight: 600 }}>
                {form.linkEnabled && form.isActive !== false ? 'Link Active' : 'Link Disabled'}
              </span>
            </label>
          </div>

          <div className="form-card-body">
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              Allow direct candidate submissions. When enabled, anyone with the public link can upload their CV to apply for this vacancy.
            </p>

            {mode === 'edit' && linkUrl && (
              <div className="url-bar-container">
                <a
                  href={form.linkEnabled && form.isActive !== false ? linkUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="url-bar-link"
                  title={form.linkEnabled && form.isActive !== false ? 'Open application page' : 'Link is disabled'}
                  onClick={(e) => { if (!form.linkEnabled || form.isActive === false) e.preventDefault(); }}
                >
                  {linkUrl}
                </a>
                <button
                  type="button"
                  className={`url-bar-copy-btn ${copiedLink ? 'success' : ''}`}
                  onClick={copyLink}
                  disabled={!form.linkEnabled || form.isActive === false}
                  title="Copy Link to Clipboard"
                >
                  {copiedLink ? (
                    <>
                      <Check size={14} /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy Link
                    </>
                  )}
                </button>
              </div>
            )}

            {mode === 'create' && (
              <div className="callout callout-info" style={{ margin: 0, padding: '10px 14px' }}>
                <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span className="text-xs">Your public application link will be generated automatically after creating the vacancy.</span>
              </div>
            )}
          </div>
        </div>

        {/* Submit & Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={
              mode === 'create' || form.isActive === false
                ? { opacity: 0.4, cursor: 'not-allowed' }
                : { color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }
            }
            disabled={mode === 'create' || archiving || saving || form.isActive === false}
            onClick={() => setConfirmArchive(true)}
            title={
              mode === 'create'
                ? 'Cannot archive new vacancy'
                : form.isActive === false
                  ? 'Vacancy is already archived'
                  : 'Archive vacancy'
            }
          >
            {archiving ? <><Loader2 size={15} className="spin" /> Archiving…</> : <><Archive size={15} /> Archive</>}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || archiving}>
              {saving ? <><Loader2 size={15} className="spin" /> Saving…</> : mode === 'create' ? 'Create Vacancy' : 'Save'}
            </button>
          </div>
        </div>
      </form>

      {/* Archive confirm modal */}
      {confirmArchive && (
        <div className="modal-overlay" onClick={() => setConfirmArchive(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Archive vacancy?</h2>
            <p className="modal-body">
              This vacancy will be moved to Archived. Candidates will no longer be able to submit applications. Existing applications are preserved.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmArchive(false)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={archiving}
                onClick={handleArchive}
              >
                {archiving ? <><Loader2 size={14} className="spin" /> Archiving…</> : <><Archive size={14} /> Archive</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .form-label-hint { font-weight: 400; color: var(--color-text-subtle); text-transform: none; letter-spacing: 0; font-size: 0.75rem; margin-left: 4px; }
      `}</style>
    </div>
  )
}
