import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { runScoringPipeline } from '@/lib/scoreApplication'
import { checkRateLimit } from '@/lib/rateLimit'
import { ApplySchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

interface KOQuestion {
  question: string
  options: string[]
  correctAnswer: number | string
}

// POST /api/jobs/[id]/apply — public candidate submission
export async function POST(req: NextRequest, { params }: Params) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  const { allowed, retryAfterMs } = checkRateLimit(`apply:${ip}`, 10, 900000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  const { id: vacancyId } = await params

  const vacancy = await prisma.vacancy.findUnique({
    where: { id: vacancyId, isActive: true },
    select: {
      recruiterId: true,
      company: true,
      role: true,
      linkEnabled: true,
      knockoutQuestions: true,
      requestedContacts: true,
      salaryExpectation: true,
    },
  })

  if (!vacancy) {
    return NextResponse.json({ error: 'Vacancy not found or closed' }, { status: 404 })
  }
  if (!vacancy.linkEnabled) {
    return NextResponse.json({ error: 'Applications are closed for this vacancy' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = ApplySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { candidateName, contacts, salaryExpectation, knockoutAnswers, extractedText } = parsed.data

  // Validate knockout answers
  const koQuestions: KOQuestion[] = JSON.parse(vacancy.knockoutQuestions || '[]')
  const answers: { question: string; answer: string; answerIndex?: number }[] = knockoutAnswers || []
  let isKnockout = false
  for (const q of koQuestions) {
    const givenObj = answers.find(a => a.question === q.question)
    const givenIndex = givenObj?.answerIndex ?? -1
    const givenText = givenObj?.answer || ''

    if (typeof q.correctAnswer === 'number') {
      if (givenIndex !== q.correctAnswer && givenText !== q.options[q.correctAnswer]) { isKnockout = true; break }
    } else {
      if (givenText !== q.correctAnswer) { isKnockout = true; break }
    }
  }

  // Create application record
  const application = await prisma.candidateApplication.create({
    data: {
      vacancyId,
      candidateName: candidateName.trim(),
      contacts: JSON.stringify(contacts || {}),
      salaryExpectation: salaryExpectation || null,
      knockoutAnswers: JSON.stringify(answers),
      extractedText: extractedText.trim(),
      status: isKnockout ? 'REJECTED_KNOCKOUT' : 'PENDING',
    },
  })

  // Fire-and-forget AI scoring via setImmediate — detaches from request lifecycle
  // In-app notification is sent inside the scoring pipeline ONLY if the candidate passes (score ≥ threshold)
  if (!isKnockout) {
    const appId = application.id
    setImmediate(() => {
      runScoringPipeline(appId).catch(e =>
        console.error('[apply] Scoring pipeline failed:', e)
      )
    })
  }

  return NextResponse.json({
    success: true,
    status: application.status,
    isKnockout,
  }, { status: 201 })
}

