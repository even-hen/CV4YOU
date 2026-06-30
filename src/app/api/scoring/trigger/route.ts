import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { runScoringPipeline } from '@/lib/scoreApplication'

// Internal scoring trigger endpoint
// Called via internal fetch from apply route to bypass Next.js response lifecycle
// Protected by shared secret header
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  const expectedSecret = process.env.INTERNAL_SECRET

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { applicationId } = await req.json()
  if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 })

  // Run pipeline — this request lives independently in the Node runtime
  await runScoringPipeline(applicationId)

  return NextResponse.json({ success: true })
}
