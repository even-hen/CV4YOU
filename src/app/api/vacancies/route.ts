import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { PLAN_LIMITS } from '@/lib/subscription'
import { VacancyCreateSchema } from '@/lib/validation'

// GET /api/vacancies — list recruiter's vacancies
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status = searchParams.get('status') || 'active' // "active" | "archived"
  const sort = searchParams.get('sort') || 'recent' // "recent" | "new_apps" | "name"
  const search = searchParams.get('q') || ''
  const pageParam = searchParams.get('page')
  const limitParam = searchParams.get('limit')

  const recruiterId = session.user.id as string

  const where: any = {
    recruiterId,
    isActive: status === 'active',
  }

  if (search && search.trim().length >= 3) {
    const term = search.trim()
    where.OR = [
      { role: { contains: term } },
      { company: { contains: term } },
    ]
  }

  const vacancies = await prisma.vacancy.findMany({
    where,
    orderBy:
      sort === 'name'
        ? { role: 'asc' }
        : { createdAt: 'desc' },
    include: {
      _count: { select: { applications: true } },
      applications: {
        where: { seen: false },
        select: { id: true },
      },
    },
  })

  const result = vacancies.map(v => ({
    id: v.id,
    company: v.company,
    role: v.role,
    linkEnabled: v.linkEnabled,
    isActive: v.isActive,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    totalApplications: v._count.applications,
    newApplications: v.applications.length,
  }))

  // Sort by new applications if requested (can't do in Prisma directly)
  if (sort === 'new_apps') {
    result.sort((a, b) => b.newApplications - a.newApplications)
  }

  if (pageParam) {
    const page = parseInt(pageParam || '1')
    const limit = parseInt(limitParam || '25')
    const startIndex = (page - 1) * limit
    const endIndex = page * limit
    const paginatedVacancies = result.slice(startIndex, endIndex)
    return NextResponse.json({
      vacancies: paginatedVacancies,
      total: result.length,
      hasMore: endIndex < result.length,
    })
  }

  return NextResponse.json(result)
}

// POST /api/vacancies — create vacancy
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const recruiterId = session.user.id as string

  // Check quota
  const user = await prisma.user.findUnique({ where: { id: recruiterId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const activeCount = await prisma.vacancy.count({
    where: { recruiterId, isActive: true },
  })

  const limit = PLAN_LIMITS[user.subscriptionTier]
  if (activeCount >= limit) {
    return NextResponse.json(
      { error: `Active vacancy limit reached (${limit} for ${user.subscriptionTier} plan)`, limitReached: true },
      { status: 403 }
    )
  }

  const body = await req.json()
  const parsed = VacancyCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const {
    company, role, responsibilities, baseRequirements,
    mandatoryRequirements, niceToHave, requestedContacts,
    salaryExpectation, knockoutQuestions, linkEnabled,
  } = parsed.data

  if (!company || !role || !responsibilities || !baseRequirements) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const vacancy = await prisma.vacancy.create({
    data: {
      recruiterId,
      company: company.trim(),
      role: role.trim(),
      responsibilities: responsibilities.trim(),
      baseRequirements: baseRequirements.trim(),
      mandatoryRequirements: mandatoryRequirements.trim(),
      niceToHave: (niceToHave || '').trim(),
      requestedContacts: JSON.stringify(requestedContacts || []),
      salaryExpectation: salaryExpectation || null,
      knockoutQuestions: JSON.stringify(knockoutQuestions || []),
      linkEnabled: linkEnabled !== false,
      isActive: true,
    },
  })

  return NextResponse.json({ id: vacancy.id }, { status: 201 })
}
