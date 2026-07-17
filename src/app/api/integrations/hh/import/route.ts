import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getHhClient } from '@/lib/hh'
import { formatHhResumeToPlainText } from '@/lib/syncHhApplications'
import { runScoringPipeline } from '@/lib/scoreApplication'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const recruiterId = session.user.id
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { vacancyId, resumeUrl } = body
  if (!vacancyId || !resumeUrl) {
    return NextResponse.json({ error: 'vacancyId and resumeUrl are required' }, { status: 400 })
  }

  // Resume IDs on hh.ru are alphanumeric (not necessarily hex-only)
  const match = resumeUrl.match(/\/resume\/([a-zA-Z0-9]+)/i)
  const resumeId = match ? match[1] : null
  if (!resumeId) {
    return NextResponse.json({ error: 'Invalid HeadHunter resume URL. Make sure it contains /resume/{id}' }, { status: 400 })
  }

  try {
    // 1 — Verify ownership of the vacancy
    const vacancy = await prisma.vacancy.findFirst({
      where: { id: vacancyId, recruiterId, isActive: true }
    })

    if (!vacancy) {
      return NextResponse.json({ error: 'Vacancy not found or access denied.' }, { status: 404 })
    }

    if (!vacancy.hhVacancyId) {
      return NextResponse.json({ error: 'Vacancy is not connected to HeadHunter.' }, { status: 400 })
    }

    // 2 — Check if already imported
    const existing = await prisma.candidateApplication.findFirst({
      where: { vacancyId, hhResumeId: resumeId }
    })

    if (existing) {
      return NextResponse.json({ error: 'This candidate has already been imported for this vacancy.' }, { status: 400 })
    }

    // 3 — Get HeadHunter client
    const hhClient = await getHhClient(recruiterId)
    if (!hhClient) {
      return NextResponse.json({ error: 'HeadHunter integration is not set up.' }, { status: 400 })
    }

    // 4 — Fetch full resume details
    const resumeRes = await hhClient.request(`/resumes/${resumeId}`)
    if (!resumeRes.ok) {
      if (resumeRes.status === 404) {
        return NextResponse.json({ error: 'Resume not found on HeadHunter. It might be private or deleted.' }, { status: 404 })
      }
      const errText = await resumeRes.text()
      console.error(`[hh/import] Failed to fetch resume ${resumeId}: ${errText}`)
      return NextResponse.json({ error: 'Failed to retrieve resume details from HeadHunter.' }, { status: resumeRes.status })
    }

    const resumeJson = await resumeRes.json()

    // 5 — Parse details and format
    const candidateName = [resumeJson.first_name, resumeJson.middle_name, resumeJson.last_name]
      .filter(Boolean)
      .join(' ') || 'HeadHunter Candidate'

    const email = resumeJson.email || null
    const phones = (resumeJson.phones || []).map((p: any) => `+${p.country || ''}${p.city || ''}${p.number || ''}`)
    const phone = phones.length > 0 ? phones[0] : null
    const alternate_url = resumeJson.alternate_url || null

    const contacts = {
      email,
      phone,
      alternate_url
    }

    const salaryExpectation = resumeJson.salary?.amount 
      ? `${resumeJson.salary.amount} ${resumeJson.salary.currency || ''}` 
      : null

    const cvText = formatHhResumeToPlainText(resumeJson)

    // 6 — Save to database
    const application = await prisma.candidateApplication.create({
      data: {
        vacancyId,
        candidateName,
        contacts: JSON.stringify(contacts),
        salaryExpectation,
        extractedText: cvText,
        hhResumeId: resumeId,
        status: 'PENDING'
      }
    })

    // 7 — Trigger AI scoring in background
    const appId = application.id
    setImmediate(() => {
      runScoringPipeline(appId).catch(err => {
        console.error(`[hh/import] Scoring failed for application ${appId}:`, err)
      })
    })

    return NextResponse.json({ success: true, candidateName })
  } catch (err: any) {
    if (err.message === 'HH_AUTH_REVOKED') {
      return NextResponse.json({ error: 'HeadHunter connection has expired or was revoked. Please reconnect in Settings.' }, { status: 401 })
    }
    console.error('[hh/import] Manual import failed:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
