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
  const [notifications, setNotifications] = useState<Notification[]>([])
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

  const fetchNotifications = useCallback(async () => {
    if (!session) return
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        setNotifications(await res.json())
        window.dispatchEvent(new CustomEvent('cv4you-notif-update'))
      }
    } catch {}
  }, [session])

  useEffect(() => {
    fetchNotifications()
    let interval = setInterval(fetchNotifications, 60000) // Poll every 60s
    
    function handleVisibility() {
      clearInterval(interval)
      if (!document.hidden) {
        fetchNotifications() // Trigger immediate fetch when focused
        interval = setInterval(fetchNotifications, 60000)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchNotifications])

  async function markAllRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
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

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="dashboard-shell">
      <Navbar
        notifications={notifications}
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
