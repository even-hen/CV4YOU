'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowUpDown, Search, SlidersHorizontal, Download, Eye, EyeOff,
  ChevronDown, Loader2, User, Phone, Mail, Star, Calendar,
  TrendingUp, CheckCircle2, XCircle, AlertTriangle, Trash2,
  RefreshCw, FileText, ChevronRight, Check
} from 'lucide-react'

interface Vacancy {
  id: string
  company: string
  role: string
}

interface Candidate {
  id: string
  candidateName: string
  contacts: Record<string, string>
  salaryExpectation: string | null
  status: string
  seen: boolean
  createdAt: string
  overallScore: number | null
  summary: string | null
  pros: string[]
  cons: string[]
  breakdown: { baseRequirements: number; niceToHave: number } | null
}

type SortKey = 'score' | 'date' | 'name'
type TabKey = 'new' | 'all'

function ScoreBadge({ score, status }: { score: number | null; status?: string }) {
  if (status === 'FAILED_SCORING') {
    return (
      <span className="score-badge score-low" title="AI evaluation failed" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        ⚠️
      </span>
    )
  }
  if (score === null) return <span className="score-badge score-pending">–</span>
  const cls = score >= 80 ? 'score-high' : score >= 65 ? 'score-mid' : 'score-low'
  return <span className={`score-badge ${cls}`}>{score}</span>
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const cls = value >= 80 ? 'bar-high' : value >= 65 ? 'bar-mid' : 'bar-low'
  return (
    <div className="score-bar-row">
      <span className="score-bar-label">{label}</span>
      <div className="score-bar-track">
        <div className={`score-bar-fill ${cls}`} style={{ width: `${value}%` }} />
      </div>
      <span className="score-bar-value">{value}</span>
    </div>
  )
}

export default function CandidatesPage() {
  const { id: vacancyId } = useParams<{ id: string }>()
  const router = useRouter()

  const [vacancy, setVacancy] = useState<Vacancy | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [newCount, setNewCount] = useState(0)

  const [tab, setTab] = useState<TabKey>('new')
  const [sort, setSort] = useState<SortKey>('score')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q)
    }, 300)
    return () => clearTimeout(timer)
  }, [q])

  const [threshold, setThreshold] = useState(50)

  const [thresholdOpen, setThresholdOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const thresholdRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [seenToggling, setSeenToggling] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (thresholdRef.current && !thresholdRef.current.contains(e.target as Node)) {
        setThresholdOpen(false)
      }
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchCandidates = useCallback(async (pageToFetch: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    try {
      const queryParam = debouncedQ.trim().length >= 3 ? debouncedQ.trim() : ''
      const params = new URLSearchParams({
        vacancyId,
        tab,
        q: queryParam,
        sort,
        threshold: String(threshold),
        page: String(pageToFetch),
        limit: '25',
      })
      const res = await fetch(`/api/candidates?${params}`)
      const data = await res.json()
      setVacancy(data.vacancy)
      setNewCount(data.newCount)

      if (append) {
        setCandidates(prev => [...prev, ...data.candidates])
      } else {
        setCandidates(data.candidates)
      }
      setHasMore(data.hasMore)
      setPage(pageToFetch)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [vacancyId, tab, debouncedQ, sort, threshold])

  function handleLoadMore() {
    if (loadingMore || !hasMore) return
    fetchCandidates(page + 1, true)
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [vacancyId])

  useEffect(() => {
    fetchCandidates(1, false)
  }, [fetchCandidates])

  async function toggleSeen(c: Candidate) {
    setSeenToggling(c.id)
    try {
      await fetch(`/api/candidates/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: !c.seen }),
      })
      const newSeen = !c.seen
      if (newSeen) {
        setNewCount(n => Math.max(0, n - 1))
      } else {
        setNewCount(n => n + 1)
      }
      if (tab === 'new' && newSeen) {
        setCandidates(prev => prev.filter(x => x.id !== c.id))
        if (expanded === c.id) {
          setExpanded(null)
        }
      } else {
        setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, seen: newSeen } : x))
      }
    } finally {
      setSeenToggling(null)
    }
  }

  async function deleteCandidate(id: string) {
    if (!confirm('Remove this application permanently?')) return
    setDeleting(id)
    try {
      await fetch(`/api/candidates/${id}`, { method: 'DELETE' })
      setCandidates(prev => prev.filter(c => c.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  async function downloadCV(c: Candidate) {
    setDownloading(c.id)
    try {
      const res = await fetch(`/api/candidates/${c.id}/download`)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${c.candidateName.replace(/\s+/g, '_')}_CV.txt`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Failed to generate CV. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  async function retryScoring(candidateId: string) {
    setRetrying(candidateId)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/retry`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Retry failed')
      const data = await res.json()
      if (data.purged) {
        alert('AI Scoring complete: Candidate score is below threshold (50) and has been automatically filtered out.')
        setCandidates(prev => prev.filter(c => c.id !== candidateId))
        if (expanded === candidateId) {
          setExpanded(null)
        }
      } else {
        setCandidates(prev =>
          prev.map(c =>
            c.id === candidateId
              ? {
                ...c,
                status: data.status,
                overallScore: data.overallScore,
                summary: data.summary,
                pros: data.pros,
                cons: data.cons,
                breakdown: data.breakdown,
              }
              : c
          )
        )
      }
    } catch (e) {
      alert('Failed to retry AI scoring. Please try again.')
    } finally {
      setRetrying(null)
    }
  }

  // Expand card without auto-marking as seen + smooth scroll
  function handleExpand(c: Candidate, e: React.MouseEvent<HTMLDivElement>) {
    const nextId = expanded === c.id ? null : c.id
    setExpanded(nextId)
    if (nextId) {
      const cardEl = e.currentTarget.closest('.candidate-card')
      setTimeout(() => {
        cardEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }

  return (
    <div className="candidates-page" style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div className="candidates-header">
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0px 10px', alignItems: 'center' }}>
          <div style={{ gridRow: '1 / 2', gridColumn: '1 / 2' }}>
            <Link href="/dashboard/vacancies" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={16} /> Back
            </Link>
          </div>
          {vacancy && (
            <>
              <div style={{ gridRow: '1 / 2', gridColumn: '2 / 3' }}>
                <h1 className="candidates-role" style={{ margin: 0, lineHeight: 1.2 }}>{vacancy.role}</h1>
              </div>
              <div style={{ gridRow: '2 / 3', gridColumn: '2 / 3' }}>
                <span className="candidates-company">{vacancy.company}</span>
              </div>
            </>
          )}
        </div>

        {/* Controls: New|All -> Threshold -> Sorting -> Search */}
        <div className="candidates-controls">
          {/* Tabs */}
          <div className="cand-tabs">
            <button
              className={`cand-tab${tab === 'new' ? ' active' : ''}`}
              onClick={() => setTab('new')}
            >
              New {newCount > 0 && <span className="cand-tab-badge">{newCount}</span>}
            </button>
            <button
              className={`cand-tab${tab === 'all' ? ' active' : ''}`}
              onClick={() => setTab('all')}
            >
              All
            </button>
          </div>

          {/* Threshold Selector Dropdown */}
          <div ref={thresholdRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="cand-sort"
              onClick={() => setThresholdOpen(v => !v)}
              style={{ gap: 6 }}
            >
              <SlidersHorizontal size={14} />
              <span>{threshold}%</span>
              <ChevronDown size={13} />
            </button>
            {thresholdOpen && (
              <div className="user-menu-dropdown" style={{ minWidth: 120, left: 0, top: 'calc(100% + 6px)' }}>
                {[95, 90, 85, 80, 75, 70, 65, 60, 55, 50].map(val => (
                  <button
                    key={val}
                    type="button"
                    className="user-menu-item"
                    onClick={() => {
                      setThreshold(val)
                      setThresholdOpen(false)
                    }}
                  >
                    {threshold === val && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
                    {threshold !== val && <span style={{ width: 14 }} />}
                    {val}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort */}
          <div ref={sortRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="cand-sort"
              onClick={() => setSortOpen(v => !v)}
              style={{ gap: 6 }}
            >
              <ArrowUpDown size={14} />
              <span>{sort === 'score' ? 'Score' : sort === 'date' ? 'New' : 'Name'}</span>
              <ChevronDown size={13} />
            </button>
            {sortOpen && (
              <div className="user-menu-dropdown" style={{ minWidth: 160, left: 0, top: 'calc(100% + 6px)' }}>
                {(['score', 'date', 'name'] as SortKey[]).map(k => (
                  <button
                    key={k}
                    type="button"
                    className="user-menu-item"
                    onClick={() => {
                      setSort(k)
                      setSortOpen(false)
                    }}
                  >
                    {sort === k && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
                    {sort !== k && <span style={{ width: 14 }} />}
                    {k === 'score' ? 'Score' : k === 'date' ? 'New' : 'Name'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="cand-search">
            <Search size={14} className="cand-search-icon" />
            <input
              className="cand-search-input"
              placeholder="Search by name…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="candidates-content">
        {loading ? (
          <div className="candidates-loading">
            <Loader2 size={28} className="spin" />
            <span>Loading candidates…</span>
          </div>
        ) : candidates.length === 0 ? (
          <div className="candidates-empty">
            <div className="candidates-empty-icon">📭</div>
            <h3>No candidates yet</h3>
            <p>
              {tab === 'new'
                ? 'No new applications. Switch to "All" to see reviewed candidates.'
                : 'No applications match your current filters.'}
            </p>
          </div>
        ) : (
          <div className="candidates-list">
            {candidates.map(c => (
              <div
                key={c.id}
                className={`candidate-card${!c.seen ? ' unseen' : ''}${expanded === c.id ? ' expanded' : ''}`}
              >
                {/* Card header — always visible */}
                <div className="candidate-card-header" onClick={e => handleExpand(c, e)}>
                  <div className="candidate-card-left">
                    <div className="candidate-avatar">
                      {c.candidateName.charAt(0).toUpperCase()}
                    </div>
                    <div className="candidate-info">
                      <div className="candidate-name">{c.candidateName}</div>
                      <div className="candidate-meta">
                        {Object.entries(c.contacts).map(([k, v]) => v ? (
                          <span key={k}>
                            {k === 'email' ? <Mail size={11} /> : k === 'phone' ? <Phone size={11} /> : <span style={{ fontSize: '0.7rem' }}>✈️</span>}
                            {v}
                          </span>
                        ) : null)}
                        {c.salaryExpectation && (
                          <span>💰 {c.salaryExpectation}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="candidate-card-right">
                    <ScoreBadge score={c.overallScore} status={c.status} />
                    <ChevronRight
                      size={16}
                      className={`expand-chevron${expanded === c.id ? ' open' : ''}`}
                    />
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded === c.id && (
                  <div className="candidate-detail">

                    {/* Failed AI Scoring Alert Banner */}
                    {c.status === 'FAILED_SCORING' && (
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '8px',
                        padding: '12px 16px',
                        marginBottom: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>
                          <AlertTriangle size={16} />
                          AI Resume Evaluation Failed
                        </div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-subtle)', lineHeight: 1.4 }}>
                          The system failed to evaluate this resume with the AI model. You can review the candidate's contacts or manually trigger a retry.
                        </p>
                        <div>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ padding: '4px 12px', fontSize: '0.8rem', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={() => retryScoring(c.id)}
                            disabled={retrying === c.id}
                          >
                            {retrying === c.id ? (
                              <Loader2 size={12} className="spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            Retry AI Scoring
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Summary */}
                    {c.summary && (
                      <div className="candidate-summary">
                        <p>{c.summary}</p>
                      </div>
                    )}

                    {/* Actions bar — moved below summary */}
                    <div className="candidate-actions" style={{ justifyContent: 'flex-end' }}>
                      {c.status === 'FAILED_SCORING' && (
                        <button
                          className="cand-action-btn active-blue"
                          onClick={() => retryScoring(c.id)}
                          disabled={retrying === c.id}
                          title="Retry AI Scoring"
                          style={{ gap: 6 }}
                        >
                          {retrying === c.id ? (
                            <><Loader2 size={14} className="spin" /> Retrying…</>
                          ) : (
                            <><RefreshCw size={14} /> Retry</>
                          )}
                        </button>
                      )}
                      <button
                        className="cand-action-btn danger"
                        onClick={() => deleteCandidate(c.id)}
                        disabled={deleting === c.id}
                        title="Delete application"
                      >
                        {deleting === c.id ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <><Trash2 size={14} /> Delete</>
                        )}
                      </button>
                      <button
                        className="cand-action-btn"
                        onClick={() => downloadCV(c)}
                        disabled={downloading === c.id}
                        title="Download structured CV"
                      >
                        {downloading === c.id ? (
                          <><Loader2 size={14} className="spin" /> Generating…</>
                        ) : (
                          <><Download size={14} /> Download</>
                        )}
                      </button>
                      <button
                        className={`cand-action-btn${!c.seen ? ' active-blue' : ''}`}
                        onClick={() => toggleSeen(c)}
                        disabled={seenToggling === c.id}
                        title={c.seen ? 'Unread' : 'Read'}
                      >
                        {seenToggling === c.id ? (
                          <Loader2 size={14} className="spin" />
                        ) : c.seen ? (
                          <><EyeOff size={14} /> Unread</>
                        ) : (
                          <><Eye size={14} /> Read</>
                        )}
                      </button>
                    </div>

                    {/* Pros & Cons */}
                    <div className="candidate-proscons">
                      {c.pros.length > 0 && (
                        <div className="proscons-col">
                          <h4 className="detail-section-title pros">
                            <CheckCircle2 size={14} /> Strengths
                          </h4>
                          <ul className="proscons-list pros">
                            {c.pros.map((p, i) => <li key={i}>{p}</li>)}
                          </ul>
                        </div>
                      )}
                      {c.cons.length > 0 && (
                        <div className="proscons-col">
                          <h4 className="detail-section-title cons">
                            <XCircle size={14} /> Gaps
                          </h4>
                          <ul className="proscons-list cons">
                            {c.cons.map((g, i) => <li key={i}>{g}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Undercut timestamp footer */}
                    <div style={{ borderTop: '1px solid var(--color-border-subtle)', fontSize: '0.75rem', color: 'var(--color-text-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={13} /> Submitted on {new Date(c.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px', marginBottom: '24px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  {loadingMore ? (
                    <><Loader2 size={16} className="spin" /> Loading…</>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) for Refresh */}
      <button
        className="btn btn-primary"
        style={{
          position: 'fixed',
          bottom: 84,
          right: 24,
          zIndex: 100,
          borderRadius: '50%',
          width: 54,
          height: 54,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={() => fetchCandidates()}
        title="Refresh list"
      >
        <RefreshCw size={22} />
      </button>
    </div>
  )
}
