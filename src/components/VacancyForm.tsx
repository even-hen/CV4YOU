'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Loader2, ArrowLeft, ExternalLink,
  Unlink, Copy, Check, Info, Archive, Link2
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
          <label className="form-label">Responsibilities *</label>
          <textarea className="form-textarea" style={{ minHeight: 150 }}
            placeholder="Describe what the candidate will be doing…"
            value={form.responsibilities}
            onChange={e => update('responsibilities', e.target.value)}
            required
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
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', background: form.salaryExpectation === o.value ? 'var(--color-primary-dim)' : 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: `1px solid ${form.salaryExpectation === o.value ? 'var(--color-primary)' : 'var(--color-border)'}`, cursor: 'pointer', transition: 'all var(--transition)', fontSize: '0.875rem' }}>
                <input type="radio" name="salary" value={o.value} checked={form.salaryExpectation === o.value} onChange={() => update('salaryExpectation', o.value)} style={{ accentColor: 'var(--color-primary)' }} />
                {o.label}
              </label>
            ))}
          </div>
        </div>

        {/* Contact fields */}
        <div>
          <p className="section-title">Request Contact Information</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {CONTACT_OPTIONS.map(c => (
              <label key={c.key} className="checkbox-group" style={{ padding: '8px 14px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: `1px solid ${form.requestedContacts.includes(c.key) ? 'var(--color-primary)' : 'var(--color-border)'}`, cursor: 'pointer', transition: 'all var(--transition)' }}>
                <input type="checkbox" checked={form.requestedContacts.includes(c.key)} onChange={() => toggleContact(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="divider" />

        {/* Knockout Questions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="section-title" style={{ marginBottom: 2 }}>Knockout Questions</p>
              <p className="text-xs text-muted">⚠️ Candidates failing these are automatically rejected. Shown as "Additional Questions" in the candidate form.</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addKO} style={{ flexShrink: 0 }}>
              <Plus size={14} /> Add question
            </button>
          </div>

          {form.knockoutQuestions.length === 0 && (
            <div className="callout callout-info">
              <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              No knockout questions set. Add multiple-choice questions where candidates must answer correctly to proceed.
            </div>
          )}

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
        </div>

        <div className="divider" />

        {/* Candidate link toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p className="section-title" style={{ marginBottom: 2 }}>Candidate Application Link</p>
            <p className="text-xs text-muted">When disabled, candidates cannot submit applications via the public link.</p>
          </div>
          <label className="toggle-wrapper" style={{ flexShrink: 0 }}>
            <label className="toggle">
              <input type="checkbox" checked={form.linkEnabled} onChange={e => update('linkEnabled', e.target.checked)} />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
            <span style={{ fontSize: '0.875rem', color: form.linkEnabled ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {form.linkEnabled ? 'Link enabled' : 'Link disabled'}
            </span>
          </label>
        </div>

        {/* Link to vacancy display & copy chain icon */}
        {mode === 'edit' && linkUrl && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <a
              href={form.linkEnabled ? linkUrl : undefined}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: form.linkEnabled ? 'var(--color-text-muted)' : 'var(--color-text-subtle)',
                textDecoration: form.linkEnabled ? 'underline' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 500,
                fontSize: '0.875rem',
                cursor: form.linkEnabled ? 'pointer' : 'default'
              }}
              title={form.linkEnabled ? 'Click to open candidate application page' : 'Link is currently disabled'}
              onClick={(e) => { if (!form.linkEnabled) e.preventDefault(); }}
            >
              {linkUrl}
            </a>
            <button
              type="button"
              onClick={copyLink}
              disabled={!form.linkEnabled}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 6px',
                cursor: form.linkEnabled ? 'pointer' : 'not-allowed',
                color: copiedLink ? 'var(--color-success)' : (form.linkEnabled ? 'var(--color-primary)' : 'var(--color-text-subtle)'),
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition)',
                opacity: form.linkEnabled ? 1 : 0.5,
                flexShrink: 0
              }}
              title="Copy candidate link"
            >
              {copiedLink ? <Check size={16} /> : <Link2 size={16} />}
            </button>
            {copiedLink && <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>Copied!</span>}
          </div>
        )}

        <div className="divider" />

        {/* Submit & Action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={mode === 'create' ? { opacity: 0.4, cursor: 'not-allowed' } : { color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }}
            disabled={mode === 'create' || archiving || saving}
            onClick={() => setConfirmArchive(true)}
            title={mode === 'create' ? 'Cannot archive new vacancy' : 'Archive vacancy'}
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
