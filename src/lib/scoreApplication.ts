/**
 * AI Evaluation Pipeline — runs after a candidate submits their application.
 *
 * Steps:
 * 1. Fetch the full application + vacancy from DB
 * 2. Call OpenRouter LLM to score the CV
 * 3. Store the score result in the DB (status → SCORED)
 * 4. Auto-purge: delete if overallScore < 50
 * 5. Send email notification if recruiter has it enabled (and SMTP is configured)
 *
 * This function is called fire-and-forget from the apply route.
 * It never throws — all errors are logged and swallowed.
 */

import { prisma } from '@/lib/prisma'
import { scoreCVAgainstVacancy } from '@/lib/openrouter'

const PURGE_THRESHOLD = 50 // Delete applications scoring below this

export async function runScoringPipeline(applicationId: string): Promise<void> {
  try {
    // 1 — Fetch application + vacancy
    const app = await prisma.candidateApplication.findUnique({
      where: { id: applicationId },
      include: {
        vacancy: {
          select: {
            responsibilities: true,
            baseRequirements: true,
            mandatoryRequirements: true,
            niceToHave: true,
            company: true,
            role: true,
            recruiterId: true,
            recruiter: {
              select: {
                email: true,
                name: true,
                emailNotificationsEnabled: true,
                preferredLanguage: true,
              },
            },
          },
        },
      },
    })

    if (!app || app.status !== 'PENDING') return

    const v = app.vacancy

    // 2 — Score CV
    const score = await scoreCVAgainstVacancy({
      responsibilities: v.responsibilities,
      baseRequirements: v.baseRequirements,
      mandatoryRequirements: v.mandatoryRequirements,
      niceToHave: v.niceToHave || '',
      cvText: app.extractedText,
      language: v.recruiter.preferredLanguage,
    })

    // 3 — Auto-purge low-scoring applications
    if (score.overallScore < PURGE_THRESHOLD) {
      await prisma.candidateApplication.delete({ where: { id: applicationId } })
      console.log(`[scoring] Purged application ${applicationId} (score: ${score.overallScore})`)
      return
    }

    // 4 — Store score
    await prisma.candidateApplication.update({
      where: { id: applicationId },
      data: {
        status: 'SCORED',
        llmScore: JSON.stringify(score),
      },
    })

    console.log(`[scoring] Scored application ${applicationId}: ${score.overallScore}/100`)

    // 5 — Email notification (optional, fire-and-forget)
    const minScore = (v.recruiter as any).minScoreEmailNotif ?? 50
    if (v.recruiter.emailNotificationsEnabled && score.overallScore >= minScore) {
      sendEmailNotification({
        to: v.recruiter.email,
        recruiterName: v.recruiter.name || 'Recruiter',
        candidateName: app.candidateName,
        role: v.role,
        company: v.company,
        score: score.overallScore,
        applicationId,
        vacancyId: app.vacancyId,
      }).catch(e => console.warn('[email] Failed to send notification:', e))
    }
  } catch (err) {
    console.error('[scoring] Pipeline error for application', applicationId, err)
    try {
      await prisma.candidateApplication.update({
        where: { id: applicationId },
        data: { status: 'FAILED_SCORING' as any },
      })
    } catch (dbErr) {
      console.error('[scoring] Failed to mark application as FAILED_SCORING:', dbErr)
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

let _transporter: Transporter | null = null

function getMailTransporter(): Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null

  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587'),
      secure: parseInt(SMTP_PORT || '587') === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }
  return _transporter
}

async function sendEmailNotification(params: {
  to: string
  recruiterName: string
  candidateName: string
  role: string
  company: string
  score: number
  applicationId: string
  vacancyId: string
}): Promise<void> {
  const transporter = getMailTransporter()
  if (!transporter) return

  const { SMTP_FROM, NEXT_PUBLIC_APP_URL, SMTP_USER } = process.env
  const appUrl = NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const link = `${appUrl}/dashboard/vacancies/${params.vacancyId}/candidates`

  const scoreEmoji = params.score >= 80 ? '🟢' : params.score >= 65 ? '🟡' : '🟠'

  const escapedCandidateName = escapeHtml(params.candidateName)
  const escapedRole = escapeHtml(params.role)
  const escapedCompany = escapeHtml(params.company)
  const escapedRecruiterName = escapeHtml(params.recruiterName)
  const escapedLink = escapeHtml(link)

  await transporter.sendMail({
    from: SMTP_FROM || `CV4YOU <${SMTP_USER}>`,
    to: params.to,
    subject: `New application: ${escapedCandidateName} → ${escapedRole} at ${escapedCompany} ${scoreEmoji} ${params.score}/100`,
    text: [
      `Hello ${params.recruiterName},`,
      '',
      `A new application has been scored for ${params.role} at ${params.company}.`,
      '',
      `Candidate: ${params.candidateName}`,
      `AI Score:  ${params.score}/100 ${scoreEmoji}`,
      '',
      `Review the application:`,
      link,
      '',
      '— CV4YOU',
    ].join('\n'),
    html: `
      <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; color: #1a1a2e;">
        <h2 style="color: #4f46e5;">New Application Scored</h2>
        <p>Hello <strong>${escapedRecruiterName}</strong>,</p>
        <p>A new application has been received and scored for <strong>${escapedRole}</strong> at <strong>${escapedCompany}</strong>.</p>
        <table style="background:#f5f5ff; border-radius:8px; padding:16px; width:100%; margin:16px 0;">
          <tr><td><strong>Candidate</strong></td><td>${escapedCandidateName}</td></tr>
          <tr><td><strong>AI Score</strong></td><td>${scoreEmoji} <strong>${params.score}/100</strong></td></tr>
        </table>
        <a href="${escapedLink}" style="display:inline-block; background:#4f46e5; color:white; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">
          View Application
        </a>
        <p style="margin-top:24px; font-size:0.875rem; color:#888;">— CV4YOU Recruitment Platform</p>
      </div>
    `,
  })
}
