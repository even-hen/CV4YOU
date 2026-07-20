'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  UploadCloud, FileText, X, Loader2, CheckCircle2,
  AlertCircle, ChevronRight, User, Phone, Mail
} from 'lucide-react'
import { extractTextFromFile, validateFile } from '@/lib/cvExtractor'

interface KOQuestion {
  question: string
  options: string[]
  correctAnswer: number | string
}

interface VacancyPublic {
  id: string
  company: string
  role: string
  responsibilities: string
  requestedContacts: string[]
  salaryExpectation: string | null
  knockoutQuestions: KOQuestion[]
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'knocked_out' | 'error' | 'closed' | 'not_found'

export default function JobPage() {
  const { id } = useParams<{ id: string }>()
  const [vacancy, setVacancy] = useState<VacancyPublic | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error' | 'closed' | 'not_found'>('loading')

  // Form state
  const [candidateName, setCandidateName] = useState('')
  const [contacts, setContacts] = useState<Record<string, string>>({})
  const [salaryExpectation, setSalaryExpectation] = useState('')
  const [koAnswers, setKoAnswers] = useState<Record<string, { answer: string; answerIndex: number }>>({})

  // File upload
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [pageCount, setPageCount] = useState<number | undefined>()
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobs/${id}`)
        if (res.status === 404) { setLoadState('not_found'); return }
        if (res.status === 403) { setLoadState('closed'); return }
        if (!res.ok) { setLoadState('error'); return }
        const data = await res.json()
        setVacancy(data)
        setLoadState('loaded')
      } catch {
        setLoadState('error')
      }
    }
    load()
  }, [id])

  const processFile = useCallback(async (f: File) => {
    const err = validateFile(f)
    if (err) { setFileError(err); return }

    setFile(f)
    setFileError('')
    setExtractedText('')
    setExtracting(true)

    const result = await extractTextFromFile(f)
    setExtracting(false)

    if (result.error || !result.text) {
      setFileError(result.error || 'Не удалось извлечь текст из файла. Пожалуйста, попробуйте другой файл.')
      setFile(null)
      return
    }

    setExtractedText(result.text)
    setPageCount(result.pageCount)
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }

  function removeFile() {
    setFile(null)
    setExtractedText('')
    setFileError('')
    setPageCount(undefined)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError('')

    if (!extractedText) {
      setSubmitError('Пожалуйста, загрузите резюме перед отправкой.')
      return
    }

    // Validate required contacts
    if (vacancy) {
      for (const c of vacancy.requestedContacts) {
        if (!contacts[c]?.trim()) {
          setSubmitError(`Пожалуйста, укажите ваш ${c === 'phone' ? 'номер телефона' : c === 'telegram' ? 'Telegram' : 'адрес электронной почты'}.`)
          return
        }
      }
      if (vacancy.salaryExpectation === 'required' && !salaryExpectation.trim()) {
        setSubmitError('Пожалуйста, укажите ваши ожидания по зарплате.')
        return
      }
    }

    setSubmitState('submitting')

    try {
      const res = await fetch(`/api/jobs/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateName,
          contacts,
          salaryExpectation: salaryExpectation || null,
          knockoutAnswers: Object.entries(koAnswers).map(([question, obj]) => ({
            question,
            answer: obj.answer,
            answerIndex: obj.answerIndex,
          })),
          extractedText,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setSubmitState('error')
        setSubmitError(data.error || 'Отправка не удалась. Пожалуйста, попробуйте еще раз.')
        return
      }

      if (data.isKnockout) {
        setSubmitState('knocked_out')
      } else {
        setSubmitState('success')
      }
    } catch {
      setSubmitState('error')
      setSubmitError('Сетевая ошибка. Пожалуйста, проверьте подключение к сети и попробуйте еще раз.')
    }
  }

  // --- Render states ---

  if (loadState === 'loading') {
    return (
      <div className="job-page-shell">
        <div className="job-loading">
          <div className="spinner" />
          <p>Загрузка вакансии…</p>
        </div>
      </div>
    )
  }

  if (loadState === 'not_found') return <JobStatusPage icon="🔍" title="Вакансия не найдена" body="Эта вакансия не существует или была удалена." />
  if (loadState === 'closed') return <JobStatusPage icon="🔒" title="Прием откликов закрыт" body="Рекрутер временно закрыл прием откликов на эту вакансию. Пожалуйста, зайдите позже." />
  if (loadState === 'error') return <JobStatusPage icon="⚠️" title="Что-то пошло не так" body="Не удалось загрузить эту вакансию. Пожалуйста, попробуйте позже." />

  if (submitState === 'success') return (
    <JobStatusPage
      icon={<CheckCircle2 size={52} color="var(--color-success)" />}
      title="Отклик отправлен!"
      body="Спасибо за отклик! Рекрутер рассмотрит ваше резюме и при необходимости свяжется с вами."
      highlight
    />
  )

  if (submitState === 'knocked_out') return (
    <JobStatusPage
      icon={<AlertCircle size={52} color="var(--color-warning)" />}
      title="Спасибо за ваш интерес"
      body="К сожалению, ваш отклик не соответствует всем требованиям к данной вакансии на данный момент. Мы ценим ваш интерес и желаем успехов в поиске работы."
    />
  )

  if (!vacancy) return null

  return (
    <div className="job-page-shell">
      <nav className="navbar" style={{ width: '100%' }}>
        <div className="navbar-logo">📋 CV4YOU</div>
      </nav>

      {/* Header */}
      <header className="job-header">
        <div className="job-title-block">
          <h1 className="job-role">{vacancy.role}</h1>
          <div className="job-company">{vacancy.company}</div>
        </div>
      </header>

      <div className="job-content">
        {/* Application form */}
        <form onSubmit={handleSubmit} className="job-card">
          <h2 className="job-section-title">Откликнуться на вакансию</h2>

          {/* Full name */}
          <div className="job-form-group">
            <label className="job-label">
              <User size={14} /> Полное имя *
            </label>
            <input
              className="job-input"
              placeholder="Ваше полное имя"
              value={candidateName}
              onChange={e => setCandidateName(e.target.value)}
              required
            />
          </div>

          {/* Dynamic contact fields */}
          {vacancy.requestedContacts.includes('phone') && (
            <div className="job-form-group">
              <label className="job-label">
                <Phone size={14} /> Номер телефона *
              </label>
              <input
                className="job-input"
                type="tel"
                placeholder="+7 (999) 000-0000"
                value={contacts.phone || ''}
                onChange={e => setContacts(c => ({ ...c, phone: e.target.value }))}
                required
              />
            </div>
          )}

          {vacancy.requestedContacts.includes('telegram') && (
            <div className="job-form-group">
              <label className="job-label">
                <span style={{ fontSize: '1rem' }}>✈️</span> Telegram *
              </label>
              <input
                className="job-input"
                placeholder="@username"
                value={contacts.telegram || ''}
                onChange={e => setContacts(c => ({ ...c, telegram: e.target.value }))}
                required
              />
            </div>
          )}

          {vacancy.requestedContacts.includes('email') && (
            <div className="job-form-group">
              <label className="job-label">
                <Mail size={14} /> Электронная почта *
              </label>
              <input
                className="job-input"
                type="email"
                placeholder="you@example.com"
                value={contacts.email || ''}
                onChange={e => setContacts(c => ({ ...c, email: e.target.value }))}
                required
              />
            </div>
          )}

          {/* Salary expectation */}
          {vacancy.salaryExpectation && vacancy.salaryExpectation !== '' && (
            <div className="job-form-group">
              <label className="job-label">
                💰 Ожидания по зарплате {vacancy.salaryExpectation === 'required' ? '*' : '(необязательно)'}
              </label>
              <input
                className="job-input"
                placeholder="например, 150 000 ₽/мес"
                value={salaryExpectation}
                onChange={e => setSalaryExpectation(e.target.value)}
                required={vacancy.salaryExpectation === 'required'}
              />
            </div>
          )}

          {/* CV upload */}
          <div className="job-form-group">
            <label className="job-label">
              <FileText size={14} /> Резюме *
              <span className="job-label-hint"> PDF или TXT, до 1 МБ</span>
            </label>

            {!file ? (
              <div
                className={`job-dropzone${dragOver ? ' drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <UploadCloud size={36} className="job-dropzone-icon" />
                <p className="job-dropzone-text">Перетащите ваше резюме сюда или <span className="job-dropzone-link">выберите на устройстве</span></p>
                <p className="job-dropzone-hint">PDF или TXT · до 1 МБ</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              <div className="job-file-preview">
                {extracting ? (
                  <div className="job-file-extracting">
                    <Loader2 size={18} className="spin" />
                    <span>Извлечение текста из {file.name}…</span>
                  </div>
                ) : (
                  <>
                    <div className="job-file-info">
                      <FileText size={18} color="var(--color-primary)" />
                      <div>
                        <div className="job-file-name">{file.name}</div>
                        <div className="job-file-meta">
                          {(file.size / 1024).toFixed(0)} KB
                          {pageCount && ` · страниц: ${pageCount}`}
                          {extractedText && ` · слов извлечено: ${extractedText.split(/\s+/).length.toLocaleString()}`}
                        </div>
                      </div>
                    </div>
                    <button type="button" className="job-file-remove" onClick={removeFile}>
                      <X size={16} />
                    </button>
                  </>
                )}
              </div>
            )}

            {fileError && (
              <div className="job-field-error">
                <AlertCircle size={14} /> {fileError}
              </div>
            )}
          </div>

          {/* Additional Questions (Knockout) */}
          {vacancy.knockoutQuestions.length > 0 && (
            <div className="job-form-section">
              <h3 className="job-subsection-title">Дополнительные вопросы</h3>
              <p className="job-subsection-hint">Пожалуйста, ответьте на следующие вопросы о вашем опыте.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 16 }}>
                {vacancy.knockoutQuestions.map((q, qi) => (
                  <div key={qi} className="job-ko-question">
                    <p className="job-ko-question-text">{qi + 1}. {q.question}</p>
                    <div className="job-ko-options">
                      {q.options.map((opt, oi) => (
                        <label key={oi} className={`job-ko-option${koAnswers[q.question]?.answerIndex === oi ? ' selected' : ''}`}>
                          <input
                            type="radio"
                            name={`ko-${qi}`}
                            value={opt}
                            checked={koAnswers[q.question]?.answerIndex === oi}
                            onChange={() => setKoAnswers(prev => ({ ...prev, [q.question]: { answer: opt, answerIndex: oi } }))}
                            required
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error message */}
          {(submitState === 'error' || submitError) && (
            <div className="job-error-banner">
              <AlertCircle size={16} />
              {submitError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="job-submit-btn"
            disabled={submitState === 'submitting' || extracting || !extractedText}
          >
            {submitState === 'submitting' ? (
              <><Loader2 size={18} className="spin" /> Отправка отклика…</>
            ) : (
              <>Отправить отклик <ChevronRight size={18} /></>
            )}
          </button>
          {!extractedText && !extracting && (
            <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--color-text-subtle)', marginTop: 8 }}>
              Пожалуйста, загрузите резюме, чтобы отправить отклик
            </p>
          )}
        </form>
      </div>

      {/* Footer */}
      <footer className="job-footer">
        <p>Работает на <strong>CV4YOU</strong> · Отклики обрабатываются безопасно</p>
      </footer>
    </div>
  )
}

/* Status page component */
function JobStatusPage({
  icon,
  title,
  body,
  highlight,
}: {
  icon: React.ReactNode | string
  title: string
  body: string
  highlight?: boolean
}) {
  return (
    <div className="job-page-shell">
      <nav className="navbar" style={{ width: '100%' }}>
        <div className="navbar-logo">📋 CV4YOU</div>
      </nav>
      <div className="job-status-page">
        <div className="job-status-icon">{icon}</div>
        <h1 className={`job-status-title${highlight ? ' highlight' : ''}`}>{title}</h1>
        <p className="job-status-body">{body}</p>
      </div>
    </div>
  )
}
