import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

// Public endpoint — no auth required
// GET /api/jobs/[id] — returns vacancy for candidate form
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params

  const vacancy = await prisma.vacancy.findUnique({
    where: { id, isActive: true },
    select: {
      id: true,
      company: true,
      role: true,
      responsibilities: true,
      requestedContacts: true,
      salaryExpectation: true,
      knockoutQuestions: true,
      linkEnabled: true,
    },
  })

  if (!vacancy) {
    return NextResponse.json({ error: 'Vacancy not found or not active' }, { status: 404 })
  }

  if (!vacancy.linkEnabled) {
    return NextResponse.json({ error: 'Applications are currently closed for this vacancy' }, { status: 403 })
  }

  return NextResponse.json({
    id: vacancy.id,
    company: vacancy.company,
    role: vacancy.role,
    responsibilities: vacancy.responsibilities,
    requestedContacts: JSON.parse(vacancy.requestedContacts || '[]'),
    salaryExpectation: vacancy.salaryExpectation,
    knockoutQuestions: JSON.parse(vacancy.knockoutQuestions || '[]'),
  })
}
