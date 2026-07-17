import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/candidates?vacancyId=...&tab=new|all&q=&sort=score|date|name&threshold=50
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const vacancyId = searchParams.get('vacancyId')
  const tab = searchParams.get('tab') || 'all'           // 'new' | 'all'
  const q = searchParams.get('q') || ''
  const sort = searchParams.get('sort') || 'score'       // 'score' | 'date' | 'name'
  const threshold = parseInt(searchParams.get('threshold') || '50')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '25')

  if (!vacancyId) return NextResponse.json({ error: 'vacancyId required' }, { status: 400 })

  // Verify recruiter owns this vacancy
  const vacancy = await prisma.vacancy.findFirst({
    where: { id: vacancyId, recruiterId: session.user.id as string },
    select: { id: true, company: true, role: true, hhVacancyId: true, hhVacancyTitle: true, hhSyncEnabled: true },
  })
  if (!vacancy) return NextResponse.json({ error: 'Vacancy not found' }, { status: 404 })

  // Build the where clause dynamically
  const where: any = {
    vacancyId,
    status: { in: ['SCORED', 'FAILED_SCORING'] as any },
  }

  if (tab === 'new') {
    where.seen = false
  }

  if (q.trim() && q.trim().length >= 3) {
    const lq = q.trim()
    where.candidateName = { contains: lq }
  }

  // Get total count for unseen for the vacancy (all status SCORED/FAILED_SCORING)
  const newCount = await prisma.candidateApplication.count({
    where: {
      vacancyId,
      status: { in: ['SCORED', 'FAILED_SCORING'] as any },
      seen: false,
    },
  })

  // Since LLM overall score is stored in JSON column `llmScore`, 
  // we either fetch and sort/filter by overallScore in memory (bounded by DB query for non-score sorts),
  // or handle DB query pagination directly if sorted by date/name.
  // To keep overallScore threshold filtering intact, we filter by threshold.
  
  // Fetch filtered applications
  const orderBy: any =
    sort === 'name' ? { candidateName: 'asc' } : { createdAt: 'desc' }

  const applications = await prisma.candidateApplication.findMany({
    where,
    orderBy,
  })

  // Map to structured results safely
  let results = applications.map(a => {
    let score = null
    try {
      score = a.llmScore ? JSON.parse(a.llmScore) : null
    } catch (e) {
      console.error('Failed to parse candidate llmScore:', e)
    }

    let contacts = {}
    try {
      contacts = JSON.parse(a.contacts || '{}')
    } catch (e) {
      console.error('Failed to parse candidate contacts:', e)
    }

    return {
      id: a.id,
      candidateName: a.candidateName,
      contacts,
      salaryExpectation: a.salaryExpectation,
      status: a.status as any,
      seen: a.seen,
      createdAt: a.createdAt,
      overallScore: score?.overallScore ?? null,
      summary: score?.summary ?? null,
      pros: score?.pros ?? [],
      cons: score?.cons ?? [],
      breakdown: score?.breakdown ?? null,
    }
  })

  // Apply score threshold filter
  results = results.filter(r => r.status === 'FAILED_SCORING' || (r.overallScore ?? 0) >= threshold)

  // Sort by score if needed
  if (sort === 'score') {
    results.sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
  }

  const total = results.length
  const startIndex = (page - 1) * limit
  const endIndex = page * limit
  const paginatedCandidates = results.slice(startIndex, endIndex)
  const hasMore = endIndex < total

  return NextResponse.json({
    vacancy: { 
      id: vacancy.id, 
      company: vacancy.company, 
      role: vacancy.role,
      hhVacancyId: vacancy.hhVacancyId,
      hhVacancyTitle: vacancy.hhVacancyTitle,
      hhSyncEnabled: vacancy.hhSyncEnabled,
    },
    candidates: paginatedCandidates,
    total,
    newCount,
    hasMore,
  })
}
