import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

import { SettingsSchema } from '@/lib/validation'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: {
      name: true,
      email: true,
      subscriptionEndsAt: true,
      subscriptionTier: true,
      emailNotificationsEnabled: true,
      minScoreEmailNotif: true,
      preferredLanguage: true,
    },
  })

  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(user)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = SettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { name, emailNotificationsEnabled, minScoreEmailNotif, preferredLanguage } = parsed.data

  await prisma.user.update({
    where: { id: session.user.id as string },
    data: {
      name: name || null,
      emailNotificationsEnabled,
      minScoreEmailNotif,
      preferredLanguage,
    },
  })

  return NextResponse.json({ success: true })
}
