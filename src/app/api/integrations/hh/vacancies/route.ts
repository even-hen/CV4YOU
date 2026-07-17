import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getHhClient } from '@/lib/hh'
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
      select: { employerId: true }
    })

    if (!integration || !integration.employerId) {
      return NextResponse.json({ error: 'HeadHunter integration is not set up or missing Employer ID.' }, { status: 400 })
    }

    const hhClient = await getHhClient(userId)
    if (!hhClient) {
      return NextResponse.json({ error: 'HeadHunter integration not found.' }, { status: 400 })
    }

    // Fetch active employer vacancies from hh.ru
    const res = await hhClient.request(`/employers/${integration.employerId}/vacancies/active?per_page=100`)

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[hh/vacancies] hh.ru API returned error: ${errText}`)
      return NextResponse.json({ error: 'Failed to fetch vacancies from HeadHunter.' }, { status: res.status })
    }

    const data = await res.json()
    const vacancies = (data.items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      alternate_url: item.alternate_url,
      area: item.area?.name || '',
    }))

    return NextResponse.json({ vacancies })
  } catch (err: any) {
    if (err.message === 'HH_AUTH_REVOKED') {
      return NextResponse.json({ error: 'HeadHunter connection revoked. Please reconnect.' }, { status: 401 })
    }
    console.error('[hh/vacancies] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
