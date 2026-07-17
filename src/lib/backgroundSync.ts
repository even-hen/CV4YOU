import { prisma } from './prisma'
import { syncVacancyApplications } from './syncHhApplications'

let syncInterval: NodeJS.Timeout | null = null

export async function runAllVacancySyncs() {
  console.log('[hh/background] Starting background synchronization cycle...')
  try {
    const vacancies = await prisma.vacancy.findMany({
      where: {
        isActive: true,
        hhVacancyId: { not: null },
        hhSyncEnabled: true,
      },
      select: { id: true }
    })

    console.log(`[hh/background] Found ${vacancies.length} vacancies mapped for background sync.`)

    for (const v of vacancies) {
      try {
        await syncVacancyApplications(v.id)
      } catch (err: any) {
        if (err.message === 'HH_AUTH_REVOKED') {
          console.warn(`[hh/background] Integration revoked for vacancy ${v.id}. Polling paused.`)
        } else {
          console.error(`[hh/background] Failed to sync vacancy ${v.id}:`, err)
        }
      }
    }
  } catch (err) {
    console.error('[hh/background] Sync cycle error:', err)
  }
}

export function startBackgroundSync() {
  if (syncInterval) {
    console.warn('[hh/background] startBackgroundSync() called but worker is already running. Skipping.')
    return
  }
  
  const intervalMinutes = parseInt(process.env.HH_SYNC_INTERVAL_MINUTES || '15', 10)
  const intervalMs = intervalMinutes * 60 * 1000

  console.log(`[hh/background] Starting HeadHunter polling worker (interval: ${intervalMinutes} minutes)`)
  
  // Run once after server starts up
  setTimeout(() => {
    runAllVacancySyncs().catch(err => console.error('[hh/background] Startup sync failed:', err))
  }, 10000)

  syncInterval = setInterval(() => {
    runAllVacancySyncs().catch(err => console.error('[hh/background] Periodic sync failed:', err))
  }, intervalMs)
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    console.log('[hh/background] HeadHunter polling worker stopped.')
  }
}
