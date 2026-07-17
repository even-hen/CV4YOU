import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

type Params = { params: Promise<{ slug: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { slug } = await params
    if (!slug) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const parts = slug.split('-')
    const id = parts[parts.length - 1]

    if (!id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const vacancy = await prisma.vacancy.findFirst({
      where: {
        id,
        isActive: true,
        linkEnabled: true,
      },
    })

    if (!vacancy) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: vacancy.id,
      company: vacancy.company,
      role: vacancy.role,
      responsibilities: vacancy.responsibilities,
      baseRequirements: vacancy.baseRequirements,
      mandatoryRequirements: vacancy.mandatoryRequirements,
      niceToHave: vacancy.niceToHave,
      requestedContacts: JSON.parse(vacancy.requestedContacts || '[]'),
      salaryExpectation: vacancy.salaryExpectation,
      knockoutQuestions: JSON.parse(vacancy.knockoutQuestions || '[]'),
    })
  } catch (error) {
    console.error('[public-job-detail]', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
