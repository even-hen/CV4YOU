import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { PLAN_DAYS, PLAN_TIER } from '@/lib/subscription'
import { extendSubscription } from '@/lib/subscription'
import crypto from 'crypto'

const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || ''

function verifyWebhookSignature(body: string, signature: string | null, secretKey: string): boolean {
  if (!signature || !secretKey) return false
  const expected = crypto.createHmac('sha256', secretKey).update(body).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    
    // Verify signature
    const signature = req.headers.get('x-yookassa-signature')
    if (!SECRET_KEY) {
      console.error('[webhook] YOOKASSA_SECRET_KEY is not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }
    if (!verifyWebhookSignature(body, signature, SECRET_KEY)) {
      console.warn('[webhook] Invalid signature — rejecting request')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }

    const event = JSON.parse(body)

    // Verify it's a succeeded payment event
    if (event.event !== 'payment.succeeded') {
      return NextResponse.json({ ok: true })
    }

    const payment = event.object
    const { recruiterId, planKey } = payment.metadata || {}

    if (!recruiterId || !planKey) {
      console.error('[webhook] Missing metadata', payment.metadata)
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    // Update transaction status
    await prisma.paymentTransaction.updateMany({
      where: { yookassaPaymentId: payment.id },
      data: { status: 'succeeded' },
    })

    // Get the recruiter
    const user = await prisma.user.findUnique({ where: { id: recruiterId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const daysToAdd = PLAN_DAYS[planKey]
    const newTier = PLAN_TIER[planKey]
    const newEndsAt = extendSubscription(user, daysToAdd)

    // Update user subscription
    await prisma.user.update({
      where: { id: recruiterId },
      data: {
        subscriptionTier: newTier,
        subscriptionEndsAt: newEndsAt,
      },
    })

    console.log(`[webhook] Subscription extended for ${recruiterId}: ${planKey} until ${newEndsAt.toISOString()}`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[webhook]', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
