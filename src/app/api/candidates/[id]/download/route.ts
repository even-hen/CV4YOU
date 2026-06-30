import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { generateStructuredCV } from '@/lib/openrouter'
import { checkRateLimit } from '@/lib/rateLimit'

type Params = { params: Promise<{ id: string }> }

// GET /api/candidates/[id]/download
// Generates and downloads a structured CV as plain text (via LLM restructuring)
export async function GET(req: NextRequest, { params }: Params) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  const { allowed, retryAfterMs } = checkRateLimit(`download:${ip}`, 10, 300000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
    )
  }

  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const app = await prisma.candidateApplication.findUnique({
    where: { id },
    include: {
      vacancy: {
        select: {
          recruiterId: true,
          role: true,
          company: true,
        },
      },
    },
  })

  if (!app || app.vacancy.recruiterId !== (session.user.id as string)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Generate structured CV via LLM with caching
  let structuredCV = app.structuredCV
  if (!structuredCV) {
    structuredCV = await generateStructuredCV(app.extractedText)
    await prisma.candidateApplication.update({
      where: { id },
      data: { structuredCV },
    })
  }

  const filename = `${app.candidateName.replace(/\s+/g, '_')}_CV.txt`
  const encodedFilename = encodeURIComponent(filename)

  return new NextResponse(structuredCV, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedFilename}`,
    },
  })
}
