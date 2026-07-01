'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, X, Plus, ExternalLink, Unlink, Link2,
  Users, Eye, Copy, Pencil, Archive, RotateCcw,
  ChevronDown, ArrowUpDown, Briefcase, Check
} from 'lucide-react'

interface Vacancy {
  id: string
  company: string
  role: string
  linkEnabled: boolean
  isActive: boolean
  createdAt: string
  totalApplications: number
  newApplications: number
}

type SortKey = 'recent' | 'new_apps' | 'name'

export default function VacanciesPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const [sort, setSort] = useState<SortKey>('new_apps')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Vacancy | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<Vacancy | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [limitError, setLimitError] = useState('')
  const [archivedPage, setArchivedPage] = useState(1)
  const [hasMoreArchived, setHasMoreArchived] = useState(false)
  const [loadingMoreArchived, setLoadingMoreArchived] = useState(false)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchVacancies = useCallback(async (pageToFetch: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMoreArchived(true)
    } else {
      setLoading(true)
    }
    const queryParam = debouncedSearch.trim().length >= 3 ? debouncedSearch.trim() : ''
    const params = new URLSearchParams({
      status: tab,
      sort,
      q: queryParam,
    })

    if (tab === 'archived') {
      params.append('page', String(pageToFetch))
      params.append('limit', '25')
    }

    try {
      const res = await fetch(`/api/vacancies?${params}`)
      if (res.ok) {
        const data = await res.json()
        if (tab === 'archived') {
          if (append) {
            setVacancies(prev => [...prev, ...data.vacancies])
          } else {
            setVacancies(data.vacancies)
          }
          setHasMoreArchived(data.hasMore)
          setArchivedPage(pageToFetch)
        } else {
          setVacancies(data)
          setHasMoreArchived(false)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setLoadingMoreArchived(false)
    }
  }, [tab, sort, debouncedSearch])

  function loadMoreArchived() {
    if (loadingMoreArchived || !hasMoreArchived) return
    fetchVacancies(archivedPage + 1, true)
  }

  useEffect(() => { fetchVacancies(1, false) }, [fetchVacancies])



  async function copyLink(v: Vacancy) {
    const url = `${window.location.origin}/jobs/${v.id}`
    await navigator.clipboard.writeText(url)
    setCopiedId(v.id)
    setTimeout(() => setCopiedId(null), 2500)
  }

  async function archiveVacancy(v: Vacancy) {
    setActionLoading(v.id)
    const res = await fetch(`/api/vacancies/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false }),
    })
    setActionLoading(null)
    setConfirmArchive(null)
    if (res.ok) fetchVacancies()
  }

  async function restoreVacancy(v: Vacancy) {
    setActionLoading(v.id)
    const res = await fetch(`/api/vacancies/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    })
    const data = await res.json()
    setActionLoading(null)
    setConfirmRestore(null)
    if (!res.ok && data.limitReached) {
      setLimitError(data.error)
      setTimeout(() => setLimitError(''), 5000)
    } else if (res.ok) {
      fetchVacancies()
    }
  }

  async function toggleLink(v: Vacancy) {
    setActionLoading(v.id + '_link')
    await fetch(`/api/vacancies/${v.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkEnabled: !v.linkEnabled }),
    })
    setActionLoading(null)
    fetchVacancies()
  }

  const SORT_LABELS: Record<SortKey, string> = {
    recent: 'Newest first',
    new_apps: 'Applications',
    name: 'Name',
  }

  return (
    <div>
      {limitError && (
        <div className="callout callout-warning mb-4" style={{ marginBottom: 16 }}>
          ⚠️ {limitError}. <a href="/dashboard/billing">Upgrade to Pro</a> for up to 30 active vacancies.
        </div>
      )}

      {/* Control Bar: Tabs -> Sort -> Search */}
      <div className="control-bar">
        <div className="tabs">
          <button className={`tab${tab === 'active' ? ' active' : ''}`} onClick={() => setTab('active')}>
            Active
          </button>
          <button className={`tab${tab === 'archived' ? ' active' : ''}`} onClick={() => setTab('archived')}>
            Archived
          </button>
        </div>

        {/* Sort dropdown */}
        <div ref={sortRef} style={{ position: 'relative' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSortOpen(v => !v)}
            style={{ gap: 6, paddingTop: 12, paddingBottom: 12 }}
          >
            <ArrowUpDown size={14} /> {SORT_LABELS[sort]} <ChevronDown size={13} />
          </button>
          {sortOpen && (
            <div className="user-menu-dropdown" style={{ minWidth: 210, right: 0, left: 'auto', top: 'calc(100% + 6px)' }}>
              {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                <button key={k} className="user-menu-item" onClick={() => { setSort(k); setSortOpen(false) }}>
                  {sort === k && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
                  {sort !== k && <span style={{ width: 14 }} />}
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="search-wrapper" style={{ flex: 1, minWidth: 160, maxWidth: 320 }}>
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="form-input"
            placeholder="Search role or company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36, background: 'var(--color-surface)' }}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}><X size={14} /></button>
          )}
        </div>
      </div>

      {/* Vacancy list */}
      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : vacancies.length === 0 ? (
        <div className="empty-state">
          <Briefcase size={40} className="empty-state-icon" />
          <h3>{tab === 'active' ? 'No active vacancies' : 'No archived vacancies'}</h3>
          <p>{tab === 'active' ? 'Create your first vacancy to start receiving applications.' : 'Archived vacancies will appear here.'}</p>
          {tab === 'active' && (
            <button className="btn btn-primary mt-4" onClick={() => router.push('/dashboard/vacancies/new')}>
              <Plus size={15} /> Create Vacancy
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {vacancies.map(v => (
            <VacancyCard
              key={v.id}
              vacancy={v}
              copiedId={copiedId}
              onEdit={() => router.push(`/dashboard/vacancies/${v.id}/edit`)}
              onViewApps={() => router.push(`/dashboard/vacancies/${v.id}/candidates`)}
              onCopyLink={() => copyLink(v)}
            />
          ))}
          {tab === 'archived' && hasMoreArchived && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={loadMoreArchived}
                disabled={loadingMoreArchived}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {loadingMoreArchived ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} /> Loading…
                  </>
                ) : (
                  'Load More'
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Archive confirm modal */}
      {confirmArchive && (
        <div className="modal-overlay" onClick={() => setConfirmArchive(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Archive vacancy?</h2>
            <p className="modal-body">
              <strong>{confirmArchive.role}</strong> at <strong>{confirmArchive.company}</strong> will be moved to Archived. Candidates will no longer be able to submit applications. Existing applications are preserved.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmArchive(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={actionLoading === confirmArchive.id}
                onClick={() => archiveVacancy(confirmArchive)}
              >
                <Archive size={14} /> Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore confirm modal */}
      {confirmRestore && (
        <div className="modal-overlay" onClick={() => setConfirmRestore(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Restore vacancy?</h2>
            <p className="modal-body">
              <strong>{confirmRestore.role}</strong> at <strong>{confirmRestore.company}</strong> will be moved back to Active. Make sure you have available vacancy slots.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmRestore(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={actionLoading === confirmRestore.id}
                onClick={() => restoreVacancy(confirmRestore)}
              >
                <RotateCcw size={14} /> Restore
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Floating Action Button (FAB) for Create Vacancy */}
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
        onClick={() => router.push('/dashboard/vacancies/new')}
        title="Create new vacancy"
        id="btn-create-vacancy"
      >
        <Plus size={24} />
      </button>
    </div>
  )
}

/* Vacancy Card Component */
interface CardProps {
  vacancy: Vacancy
  copiedId: string | null
  onEdit: () => void
  onViewApps: () => void
  onCopyLink: () => void
}

function VacancyCard({ vacancy: v, copiedId, onEdit, onViewApps, onCopyLink }: CardProps) {
  const isCopied = copiedId === v.id

  return (
    <div className="vacancy-card" onClick={onViewApps} style={{ cursor: 'pointer' }} title="Click to view applications">
      <div className="vacancy-card-header">
        <div style={{ minWidth: 0 }}>
          <div className="vacancy-company">{v.company}</div>
          <div className="vacancy-role">{v.role}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {v.newApplications > 0 && (
            <span className="badge badge-primary" title={`${v.newApplications} new application${v.newApplications !== 1 ? 's' : ''}`}>
              {v.newApplications} new
            </span>
          )}
          <span className="badge badge-muted" title={`${v.totalApplications} total application${v.totalApplications !== 1 ? 's' : ''}`}>
            <Users size={11} /> {v.totalApplications}
          </span>
        </div>
      </div>

      <div className="vacancy-meta" style={{ marginBottom: 0 }}>
        <span>{new Date(v.createdAt).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</span>

        {/* Link status & Chain link copy icon */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: v.linkEnabled ? 'var(--color-success)' : 'var(--color-text-subtle)' }}>
          {v.linkEnabled ? <ExternalLink size={13} /> : <Unlink size={13} />}
          {v.linkEnabled ? 'Link active' : 'Link disabled'}
          {v.linkEnabled && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCopyLink(); }}
              style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer', color: isCopied ? 'var(--color-success)' : 'var(--color-primary)', display: 'inline-flex', alignItems: 'center' }}
              title="Copy candidate link"
            >
              <Link2 size={14} />
            </button>
          )}
          {isCopied && <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600, marginLeft: 2 }}>Copied!</span>}
        </span>

        {/* Edit icon aligned to right */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="edit-vacancy-btn"
          title="Edit vacancy"
        >
          <Pencil size={15} />
        </button>
      </div>
    </div>
  )
}
