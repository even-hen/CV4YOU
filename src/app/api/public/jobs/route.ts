import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}

export async function GET(req: NextRequest) {
  try {
    const vacancies = await prisma.vacancy.findMany({
      where: {
        isActive: true,
        linkEnabled: true,
      },
      select: {
        id: true,
        company: true,
        role: true,
        responsibilities: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    const result = vacancies.map((v) => ({
      id: v.id,
      slug: `${slugify(v.company)}-${slugify(v.role)}-${v.id}`,
      company: v.company,
      role: v.role,
      responsibilities: v.responsibilities,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('[public-jobs]', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
