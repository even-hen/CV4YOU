import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { generateStructuredCV } from '@/lib/openrouter'

import { CandidatePatchSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/candidates/[id] — mark seen / unseen
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = CandidatePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { seen } = parsed.data

  // Verify ownership through vacancy
  const app = await prisma.candidateApplication.findUnique({
    where: { id },
    include: { vacancy: { select: { recruiterId: true } } },
  })

  if (!app || app.vacancy.recruiterId !== (session.user.id as string)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.candidateApplication.update({
    where: { id },
    data: {
      seen,
    },
  })

  return NextResponse.json({ id: updated.id, seen: updated.seen })
}

// DELETE /api/candidates/[id] — remove application
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const app = await prisma.candidateApplication.findUnique({
    where: { id },
    include: { vacancy: { select: { recruiterId: true } } },
  })

  if (!app || app.vacancy.recruiterId !== (session.user.id as string)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.candidateApplication.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
