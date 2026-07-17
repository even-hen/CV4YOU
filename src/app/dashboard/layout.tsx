'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const syncedRef = useRef(false)

  useEffect(() => {
    if (status !== 'authenticated' || syncedRef.current) return
    syncedRef.current = true
    async function syncSession() {
      try {
        const res = await fetch('/api/user/settings')
        if (res.ok) {
          const _data = await res.json()
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

  return (
    <div className="dashboard-shell">
      <Navbar
        unreadCount={unreadCount}
        onMarkAllRead={markAllRead}
      />
      <main className="page-content">{children}</main>
    </div>
  )
}
