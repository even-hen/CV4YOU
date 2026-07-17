import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncVacancyApplications } from '@/lib/syncHhApplications'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const recruiterId = session.user.id
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { vacancyId } = body
  if (!vacancyId) {
    return NextResponse.json({ error: 'vacancyId is required' }, { status: 400 })
  }

  try {
    // Verify ownership of the vacancy
    const vacancy = await prisma.vacancy.findFirst({
      where: { id: vacancyId, recruiterId, isActive: true }
    })

    if (!vacancy) {
      return NextResponse.json({ error: 'Vacancy not found or access denied.' }, { status: 404 })
    }

    if (!vacancy.hhVacancyId) {
      return NextResponse.json({ error: 'Vacancy is not connected to HeadHunter.' }, { status: 400 })
    }

    // Manual sync always runs regardless of the hhSyncEnabled pause toggle.
    // We pass ignoreSyncEnabled: true so the recruiter can always trigger it on demand.
    const syncPaused = !vacancy.hhSyncEnabled
    const imported = await syncVacancyApplications(vacancyId, { ignoreSyncEnabled: true })

    return NextResponse.json({
      success: true,
      imported,
      syncPaused,
    })
  } catch (err: any) {
    if (err.message === 'HH_AUTH_REVOKED') {
      return NextResponse.json({ error: 'HeadHunter authorization has expired or was revoked. Please reconnect in Settings.' }, { status: 401 })
    }
    console.error('[hh/sync] Manual synchronization failed:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
