import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { runScoringPipeline } from '@/lib/scoreApplication'
import { checkRateLimit } from '@/lib/rateLimit'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  const { allowed, retryAfterMs } = checkRateLimit(`retry:${ip}`, 5, 300000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify recruiter owns this application
  const app = await prisma.candidateApplication.findUnique({
    where: { id },
    include: {
      vacancy: {
        select: { recruiterId: true },
      },
    },
  })

  if (!app || app.vacancy.recruiterId !== (session.user.id as string)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Reset status to PENDING
  await prisma.candidateApplication.update({
    where: { id },
    data: { status: 'PENDING', llmScore: null },
  })

  // Run pipeline synchronously for the retry action
  await runScoringPipeline(id)

  // Fetch updated candidate
  const updated = await prisma.candidateApplication.findUnique({
    where: { id },
  })

  if (!updated) {
    return NextResponse.json({
      success: true,
      purged: true,
      status: 'PURGED_LOW_SCORE',
    })
  }

  const score = updated.llmScore ? JSON.parse(updated.llmScore) : null

  return NextResponse.json({
    success: updated.status === 'SCORED',
    status: updated.status,
    overallScore: score?.overallScore ?? null,
    summary: score?.summary ?? null,
    pros: score?.pros ?? [],
    cons: score?.cons ?? [],
    breakdown: score?.breakdown ?? null,
  })
}
