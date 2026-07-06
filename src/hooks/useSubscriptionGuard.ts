'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { isAccessActive } from '@/lib/subscription'

export function useSubscriptionGuard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (!session) { router.push('/login'); return }
  }, [session, status, router])

  const user = session?.user
  const active = user ? isAccessActive() : false

  return { session, status, user, isActive: active }
}
