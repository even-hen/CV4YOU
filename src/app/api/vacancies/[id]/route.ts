import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { PLAN_LIMITS, getEffectiveTier } from '@/lib/subscription'
import { VacancyCreateSchema } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

async function getVacancyOwned(vacancyId: string, recruiterId: string) {
  return prisma.vacancy.findFirst({ where: { id: vacancyId, recruiterId } })
}

// GET /api/vacancies/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const vacancy = await getVacancyOwned(id, session.user.id as string)
  if (!vacancy) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    ...vacancy,
    requestedContacts: JSON.parse(vacancy.requestedContacts || '[]'),
    knockoutQuestions: JSON.parse(vacancy.knockoutQuestions || '[]'),
  })
}

// PATCH /api/vacancies/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const recruiterId = session.user.id as string
  const existing = await getVacancyOwned(id, recruiterId)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const parsed = VacancyCreateSchema.partial().safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const data = parsed.data

  const isActiveUpdate = 'isActive' in body ? data.isActive : undefined
  const linkEnabledUpdate = 'linkEnabled' in body ? data.linkEnabled : undefined

  // If activating, check quota
  if (isActiveUpdate === true && !existing.isActive) {
    const user = await prisma.user.findUnique({ where: { id: recruiterId } })
    const activeCount = await prisma.vacancy.count({ where: { recruiterId, isActive: true } })
    const effectiveTier = getEffectiveTier(user!)
    const limit = PLAN_LIMITS[effectiveTier]
    if (activeCount >= limit) {
      return NextResponse.json(
        { error: `Active vacancy limit reached (${limit})`, limitReached: true },
        { status: 403 }
      )
    }
  }

  // Enforce 1-to-1 HeadHunter vacancy unique mapping constraint
  if (data.hhVacancyId && data.hhVacancyId !== existing.hhVacancyId) {
    const existingLink = await prisma.vacancy.findFirst({
      where: { hhVacancyId: data.hhVacancyId, isActive: true, NOT: { id } }
    })
    if (existingLink) {
      return NextResponse.json({ error: 'This HeadHunter vacancy is already connected to another vacancy in CV4YOU.' }, { status: 400 })
    }
  }

  // Requirement: When archiving, disable candidate link
  const finalLinkEnabled = isActiveUpdate === false ? false : linkEnabledUpdate
  const isArchiving = isActiveUpdate === false

  const updated = await prisma.vacancy.update({
    where: { id },
    data: {
      ...(data.company !== undefined && { company: data.company }),
      ...(data.role !== undefined && { role: data.role }),
      ...(data.responsibilities !== undefined && { responsibilities: data.responsibilities }),
      ...(data.baseRequirements !== undefined && { baseRequirements: data.baseRequirements }),
      ...(data.mandatoryRequirements !== undefined && { mandatoryRequirements: data.mandatoryRequirements }),
      ...(data.niceToHave !== undefined && { niceToHave: data.niceToHave }),
      ...(data.requestedContacts !== undefined && { requestedContacts: JSON.stringify(data.requestedContacts) }),
      ...(data.salaryExpectation !== undefined && { salaryExpectation: data.salaryExpectation }),
      ...(data.knockoutQuestions !== undefined && { knockoutQuestions: JSON.stringify(data.knockoutQuestions) }),
      ...(finalLinkEnabled !== undefined && { linkEnabled: finalLinkEnabled }),
      ...(isActiveUpdate !== undefined && { isActive: isActiveUpdate }),
      hhVacancyId: isArchiving ? null : (data.hhVacancyId !== undefined ? data.hhVacancyId : undefined),
      hhVacancyTitle: isArchiving ? null : (data.hhVacancyTitle !== undefined ? data.hhVacancyTitle : undefined),
      hhSyncEnabled: isArchiving ? false : (data.hhSyncEnabled !== undefined ? data.hhSyncEnabled : undefined),
    },
  })

  return NextResponse.json({ id: updated.id })
}

// DELETE /api/vacancies/[id] — archives (sets isActive=false, unlinks hh.ru vacancy)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await getVacancyOwned(id, session.user.id as string)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.vacancy.update({
    where: { id },
    data: {
      isActive: false,
      linkEnabled: false,
      hhVacancyId: null,
      hhVacancyTitle: null,
      hhSyncEnabled: false,
    }
  })
  return NextResponse.json({ success: true })
}
