import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  
  try {
    const integration = await prisma.hhIntegration.findUnique({
      where: { userId },
      select: {
        id: true,
        employerId: true,
        hhUserId: true,
        expiresAt: true,
      }
    })

    if (!integration) {
      return NextResponse.json({ connected: false })
    }

    return NextResponse.json({
      connected: true,
      employerId: integration.employerId,
      hhUserId: integration.hhUserId,
      isExpired: new Date(integration.expiresAt).getTime() < Date.now(),
    })
  } catch (err) {
    console.error('[hh/status] Failed to fetch integration status:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
