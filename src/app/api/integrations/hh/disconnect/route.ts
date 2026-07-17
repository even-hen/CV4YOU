import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const recruiterId = session.user.id

  try {
    // 1 — Delete the integration record
    await prisma.hhIntegration.deleteMany({
      where: { userId: recruiterId },
    })

    // 2 — Unlink only the HeadHunter-connected vacancies (don't touch unlinked ones)
    await prisma.vacancy.updateMany({
      where: { recruiterId, hhVacancyId: { not: null } },
      data: {
        hhVacancyId: null,
        hhVacancyTitle: null,
        hhSyncEnabled: false,
      }
    })

    console.log(`[hh/disconnect] HeadHunter integration removed for user ${recruiterId}`)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[hh/disconnect] Failed to disconnect integration:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
