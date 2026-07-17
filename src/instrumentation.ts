export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[instrumentation] Bootstrapping background workers...')
    try {
      const { startBackgroundSync } = await import('@/lib/backgroundSync')
      startBackgroundSync()
    } catch (err) {
      console.error('[instrumentation] Failed to start background sync worker:', err)
    }
  }
}
