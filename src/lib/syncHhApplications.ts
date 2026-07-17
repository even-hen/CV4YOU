import { prisma } from './prisma'
import { getHhClient } from './hh'
import { runScoringPipeline } from './scoreApplication'

export function formatHhResumeToPlainText(resume: any): string {
  const parts: string[] = []
  
  parts.push(`# Resume: ${resume.title || 'Candidate'}`)
  
  const name = [resume.first_name, resume.middle_name, resume.last_name].filter(Boolean).join(' ')
  parts.push(`Name: ${name || 'N/A'}`)
  if (resume.age) parts.push(`Age: ${resume.age}`)
  if (resume.gender?.name) parts.push(`Gender: ${resume.gender.name}`)
  if (resume.area?.name) parts.push(`Location: ${resume.area.name}`)
  
  if (resume.email) parts.push(`Email: ${resume.email}`)
  if (resume.phones && resume.phones.length > 0) {
    const phones = resume.phones.map((p: any) => `+${p.country || ''}${p.city || ''}${p.number || ''}`).join(', ')
    parts.push(`Phones: ${phones}`)
  }
  
  parts.push('\n---')

  if (resume.skills) {
    parts.push('\n## About Me')
    parts.push(resume.skills)
  }

  if (resume.key_skills && resume.key_skills.length > 0) {
    parts.push('\n## Key Skills')
    parts.push(resume.key_skills.map((s: any) => `- ${s.name || s}`).join('\n'))
  }

  if (resume.experience && resume.experience.length > 0) {
    parts.push('\n## Work Experience')
    resume.experience.forEach((exp: any, index: number) => {
      // hh.ru returns company name as exp.employer.name (not exp.company.name)
      const companyName = exp.employer?.name || exp.company || 'Company'
      parts.push(`\n### Experience #${index + 1}: ${exp.position || 'Role'} at ${companyName}`)
      if (exp.start || exp.end) {
        parts.push(`Duration: ${exp.start || ''} to ${exp.end || 'Present'}`)
      }
      if (exp.description) {
        parts.push(exp.description)
      }
    })
  }

  if (resume.education) {
    parts.push('\n## Education')
    if (resume.education.level?.name) {
      parts.push(`Level: ${resume.education.level.name}`)
    }
    if (resume.education.primary && resume.education.primary.length > 0) {
      resume.education.primary.forEach((edu: any) => {
        parts.push(`- ${edu.name || 'Institution'} (${edu.year || ''}) - ${edu.result || ''}`)
      })
    }
  }

  return parts.join('\n')
}

/**
 * Deactivates a user's HH integration and creates an in-app notification.
 * Called when a mid-request 401 occurs (i.e. token was invalidated server-side
 * without going through the normal token-refresh path).
 */
async function revokeIntegration(userId: string) {
  await prisma.hhIntegration.delete({ where: { userId } }).catch(() => {})
  await prisma.notification.create({
    data: {
      recruiterId: userId,
      message: 'Your HeadHunter connection was revoked or is invalid. Please reconnect in Settings.',
      link: '/dashboard/settings',
    },
  }).catch(() => {})
}

/**
 * Synchronizes HeadHunter applications for a single linked vacancy.
 * Returns the number of newly imported candidates.
 *
 * @param vacancyId - The CV4YOU vacancy ID to sync.
 * @param ignoreSyncEnabled - If true, bypasses the hhSyncEnabled check (e.g. manual
 *   sync should still run even when background sync is paused). When false (default),
 *   the function returns 0 immediately for paused vacancies.
 */
export async function syncVacancyApplications(
  vacancyId: string,
  { ignoreSyncEnabled = false }: { ignoreSyncEnabled?: boolean } = {}
): Promise<number> {
  const vacancy = await prisma.vacancy.findUnique({
    where: { id: vacancyId, isActive: true },
    select: { id: true, recruiterId: true, hhVacancyId: true, hhSyncEnabled: true }
  })

  if (!vacancy || !vacancy.hhVacancyId) {
    return 0
  }

  // Respect the sync-enabled flag unless the caller explicitly overrides it
  if (!ignoreSyncEnabled && !vacancy.hhSyncEnabled) {
    console.log(`[hh/sync] Skipping vacancy ${vacancy.id}: background sync is paused (hhSyncEnabled=false).`)
    return 0
  }

  const hhClient = await getHhClient(vacancy.recruiterId)
  if (!hhClient) {
    throw new Error('HH_NOT_CONNECTED')
  }

  console.log(`[hh/sync] Fetching negotiations for vacancy ${vacancy.id} (hhVacancyId: ${vacancy.hhVacancyId})`)

  let importedCount = 0
  let currentPage = 0
  let totalPages = 1 // Updated after first request

  try {
    // Paginate through all negotiations pages
    while (currentPage < totalPages) {
      const res = await hhClient.request(
        `/negotiations?vacancy_id=${vacancy.hhVacancyId}&per_page=100&page=${currentPage}`
      )

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`HeadHunter API returned ${res.status}: ${errorText}`)
      }

      const data = await res.json()
      // hh.ru returns { items, pages, found, per_page, page }
      totalPages = data.pages ?? 1
      currentPage++

      const negotiations = data.items || []

      for (const neg of negotiations) {
        const resumeId = neg.resume?.id
        const negId = neg.id
        if (!resumeId) continue

        // Check if this resume has already been imported for this vacancy
        const existing = await prisma.candidateApplication.findFirst({
          where: { vacancyId, hhResumeId: resumeId }
        })

        if (existing) continue

        try {
          console.log(`[hh/sync] Importing new candidate resume: ${resumeId}`)
          const resumeRes = await hhClient.request(`/resumes/${resumeId}`)
          if (!resumeRes.ok) {
            console.error(`[hh/sync] Failed to fetch resume ${resumeId}: ${resumeRes.status}`)
            continue
          }

          const resumeJson = await resumeRes.json()

          const candidateName = [resumeJson.first_name, resumeJson.middle_name, resumeJson.last_name]
            .filter(Boolean)
            .join(' ') || 'HeadHunter Candidate'

          const email = resumeJson.email || null
          const phones = (resumeJson.phones || []).map((p: any) => `+${p.country || ''}${p.city || ''}${p.number || ''}`)
          const phone = phones.length > 0 ? phones[0] : null
          const alternate_url = resumeJson.alternate_url || null

          const contacts = { email, phone, alternate_url }

          const salaryExpectation = resumeJson.salary?.amount 
            ? `${resumeJson.salary.amount} ${resumeJson.salary.currency || ''}` 
            : null

          const cvText = formatHhResumeToPlainText(resumeJson)

          const application = await prisma.candidateApplication.create({
            data: {
              vacancyId,
              candidateName,
              contacts: JSON.stringify(contacts),
              salaryExpectation,
              extractedText: cvText,
              hhResumeId: resumeId,
              hhNegotiationId: negId,
              status: 'PENDING'
            }
          })

          // Run AI scoring pipeline in background
          const appId = application.id
          setImmediate(() => {
            runScoringPipeline(appId).catch(err => {
              console.error(`[hh/sync] Scoring failed for application ${appId}:`, err)
            })
          })

          importedCount++
        } catch (err: any) {
          if (err.message === 'HH_AUTH_REVOKED') {
            // The token was invalidated mid-sync — clean up and abort the whole sync
            await revokeIntegration(vacancy.recruiterId)
            throw err
          }
          console.error(`[hh/sync] Failed to import negotiation ${negId} / resume ${resumeId}:`, err)
        }
      }
    }
  } catch (err: any) {
    if (err.message === 'HH_AUTH_REVOKED') {
      throw err
    }
    throw err
  }

  console.log(`[hh/sync] Completed sync for vacancy ${vacancy.id}. Imported ${importedCount} candidates.`)
  return importedCount
}
