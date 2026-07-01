import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const recruiterId = session.user.id as string
  const { searchParams } = req.nextUrl
  
  const countOnly = searchParams.get('countOnly') === 'true'
  const skip = parseInt(searchParams.get('skip') || '0', 10)
  const take = parseInt(searchParams.get('take') || '5', 10)

  // We only care about unread notifications now
  const where = {
    recruiterId,
    read: false,
  }

  if (countOnly) {
    const count = await prisma.notification.count({ where })
    return NextResponse.json({ count })
  }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take: take + 1, // Get one extra to check if there are more
  })

  const hasMore = notifications.length > take
  const data = hasMore ? notifications.slice(0, take) : notifications

  return NextResponse.json({
    notifications: data,
    hasMore,
  })
}
