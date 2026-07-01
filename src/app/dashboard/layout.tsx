'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Navbar, SubscriptionBanner, PaywallOverlay } from '@/components/Navbar'
import { isAccessActive } from '@/lib/subscription'

interface Notification {
  id: string
  message: string
  link?: string
  read: boolean
  createdAt: string
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [dbUser, setDbUser] = useState<any>(null)
  const syncedRef = useRef(false)

  useEffect(() => {
    if (status !== 'authenticated' || syncedRef.current) return
    syncedRef.current = true
    async function syncSession() {
      try {
        const res = await fetch('/api/user/settings')
        if (res.ok) {
          const data = await res.json()
          setDbUser(data)
          update()
        }
      } catch (err) {
        console.error('Failed to sync session:', err)
      }
    }
    syncSession()
  }, [status, update])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchUnreadCount = useCallback(async () => {
    if (status !== 'authenticated') return
    try {
      const res = await fetch('/api/notifications?countOnly=true')
      if (res.ok) {
        const { count } = await res.json()
        setUnreadCount(count)
      }
    } catch {}
  }, [status])

  useEffect(() => {
    fetchUnreadCount()
    let interval = setInterval(fetchUnreadCount, 60000) // Poll every 60s
    
    function handleVisibility() {
      clearInterval(interval)
      if (!document.hidden) {
        fetchUnreadCount() // Trigger immediate fetch when focused
        interval = setInterval(fetchUnreadCount, 60000)
      }
    }

    // Listen for custom event to trigger immediate count refresh (e.g. after marking notifications read in Navbar)
    function handleNotifRefresh() {
      fetchUnreadCount()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('cv4you-refresh-notif-count', handleNotifRefresh)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('cv4you-refresh-notif-count', handleNotifRefresh)
    }
  }, [fetchUnreadCount])

  async function markAllRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setUnreadCount(0)
  }

  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (!session) return null

  const user = session.user
  const trialEndsAt = dbUser ? dbUser.trialEndsAt : (user?.trialEndsAt || null)
  const subscriptionEndsAt = dbUser ? dbUser.subscriptionEndsAt : (user?.subscriptionEndsAt || null)
  const active = isAccessActive({
    trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : new Date(0),
    subscriptionEndsAt: subscriptionEndsAt ? new Date(subscriptionEndsAt) : null,
  })

  return (
    <div className="dashboard-shell">
      <Navbar
        unreadCount={unreadCount}
        onMarkAllRead={markAllRead}
      />
      {!active && <PaywallOverlay />}
      <main className="page-content">{children}</main>
      <SubscriptionBanner
        trialEndsAt={trialEndsAt}
        subscriptionEndsAt={subscriptionEndsAt}
        isActive={active}
      />
    </div>
  )
}
