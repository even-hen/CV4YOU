'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell, ChevronDown, Sun, Moon, User, CreditCard,
  BellOff, LogOut, Briefcase
} from 'lucide-react'
import './dashboard.css'

interface Notification {
  id: string
  message: string
  link?: string
  read: boolean
  createdAt: string
}

interface NavbarProps {
  title?: string
  unreadCount: number
  onMarkAllRead: () => void
}

export function Navbar({ title, unreadCount, onMarkAllRead }: NavbarProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [skip, setSkip] = useState(0)

  const menuRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLDivElement>(null)
  const user = session?.user
  const [currentTheme, setCurrentTheme] = useState<string>('light')

  // Initialize theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('cv4you-theme') || 'light'
    document.documentElement.setAttribute('data-theme', saved)
    setCurrentTheme(saved)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Fetch initial notifications when bell is opened
  useEffect(() => {
    if (!bellOpen) return

    async function fetchInitialNotifications() {
      setLoading(true)
      try {
        const res = await fetch('/api/notifications?skip=0&take=5')
        if (res.ok) {
          const data = await res.json()
          setNotifications(data.notifications)
          setHasMore(data.hasMore)
          setSkip(5)
        }
      } catch (err) {
        console.error('Failed to fetch notifications', err)
      } finally {
        setLoading(false)
      }
    }

    fetchInitialNotifications()
  }, [bellOpen])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/notifications?skip=${skip}&take=5`)
      if (res.ok) {
        const data = await res.json()
        setNotifications(prev => [...prev, ...data.notifications])
        setHasMore(data.hasMore)
        setSkip(prev => prev + 5)
      }
    } catch (err) {
      console.error('Failed to load more notifications', err)
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleMarkAllRead() {
    // Clear list locally immediately
    setNotifications([])
    setHasMore(false)
    setSkip(0)
    // Notify layout and call actual api
    await onMarkAllRead()
    window.dispatchEvent(new CustomEvent('cv4you-refresh-notif-count'))
  }

  function toggleTheme() {
    const next = currentTheme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('cv4you-theme', next)
    setCurrentTheme(next)
  }

  async function handleSignOut() {
    await signOut({ redirect: false })
    router.push('/login')
  }

  return (
    <nav className="navbar">
      <Link href="/dashboard/vacancies" className="navbar-logo">🎯 CV4YOU</Link>

      {title && <span className="navbar-title">{title}</span>}

      <div className="navbar-actions">
        {/* Notification Bell */}
        <div className="user-menu-wrapper" ref={bellRef}>
          <button className="notif-btn" onClick={() => setBellOpen(v => !v)} aria-label="Notifications" id="notif-bell">
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>

          {bellOpen && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <span className="font-semibold">Notifications</span>
                {unreadCount > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead}>Mark all read</button>
                )}
              </div>
              <div className="notif-list">
                {loading ? (
                  <div className="notif-empty"><div className="notif-spinner" /></div>
                ) : notifications.length === 0 ? (
                  <div className="notif-empty">
                    <BellOff size={20} />
                    <span>You&apos;re all caught up</span>
                  </div>
                ) : (
                  <>
                    {notifications.map(n => (
                      <a
                        key={n.id}
                        href={n.link || '/dashboard/vacancies'}
                        className={`notif-item${n.read ? '' : ' unread'}`}
                        onClick={() => setBellOpen(false)}
                      >
                        <span className="notif-dot" />
                        <div>
                          <p className="notif-msg">{n.message}</p>
                          <p className="notif-time">{new Date(n.createdAt).toLocaleDateString()}</p>
                        </div>
                      </a>
                    ))}
                    {hasMore && (
                      <button
                        className="notif-load-more"
                        onClick={loadMore}
                        disabled={loadingMore}
                      >
                        {loadingMore ? 'Loading...' : 'Show more...'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="user-menu-wrapper" ref={menuRef}>
          <button className="user-menu-btn" onClick={() => setMenuOpen(v => !v)} id="user-menu-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={15} />
            <span className="truncate" style={{ maxWidth: 120 }}>{user?.name || user?.email || 'Account'}</span>
            {user?.subscriptionTier === 'PRO' && (
              <span 
                className="badge-primary" 
                style={{ 
                  fontSize: '0.7rem', 
                  fontWeight: 'bold', 
                  padding: '1px 5px', 
                  borderRadius: 4, 
                  backgroundColor: 'var(--color-primary)', 
                  color: 'white',
                  cursor: 'help'
                }}
                title="PRO Features:&#10;• Export candidates to CSV&#10;• Share candidate by link&#10;• Auto replies for candidates&#10;• Custom branding"
              >
                PRO
              </span>
            )}
            <ChevronDown size={14} />
          </button>

          {menuOpen && (
            <div className="user-menu-dropdown">
              <div style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                Plan: <strong style={{ color: user?.subscriptionTier === 'PRO' ? 'var(--color-primary)' : 'var(--color-text)' }}>{user?.subscriptionTier || 'BASIC'}</strong>
                {user?.subscriptionTier === 'PRO' ? (
                  <div style={{ marginTop: 6, fontSize: '0.7rem' }}>
                    <div style={{ fontWeight: '600', marginBottom: 2 }}>PRO Features Active:</div>
                    <ul style={{ margin: '4px 0 0 12px', padding: 0, listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <li>Export candidates to CSV</li>
                      <li>Share candidate by link</li>
                      <li>Auto replies for candidate</li>
                      <li>Custom branding</li>
                    </ul>
                  </div>
                ) : (
                  <div style={{ marginTop: 4 }}>
                    <Link href="/dashboard/billing" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }} onClick={() => setMenuOpen(false)}>
                      Upgrade to PRO
                    </Link>
                  </div>
                )}
              </div>

              <Link href="/dashboard/vacancies" className="user-menu-item" onClick={() => setMenuOpen(false)}>
                <Briefcase size={15} /> Vacancies
              </Link>
              <Link href="/dashboard/settings" className="user-menu-item" onClick={() => setMenuOpen(false)}>
                <User size={15} /> Settings
              </Link>
              <Link href="/dashboard/billing" className="user-menu-item" onClick={() => setMenuOpen(false)}>
                <CreditCard size={15} /> Billing
              </Link>

              <div className="user-menu-divider" />

              <div className="theme-toggle-row">
                {currentTheme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                <span>{currentTheme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
                <button className="theme-switch" onClick={toggleTheme} aria-label="Toggle theme">
                  <span className={`theme-switch-thumb ${currentTheme === 'light' ? 'light' : ''}`} />
                </button>
              </div>

              <div className="user-menu-divider" />

              <button className="user-menu-item danger" onClick={handleSignOut}>
                <LogOut size={15} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
