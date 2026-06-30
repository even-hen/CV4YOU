import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { PLAN_DAYS, PLAN_TIER, PLAN_PRICES_RUB } from '@/lib/subscription'
import crypto from 'crypto'

const SHOP_ID = process.env.YOOKASSA_SHOP_ID || ''
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planKey } = await req.json()

  if (!PLAN_DAYS[planKey] || !PLAN_PRICES_RUB[planKey]) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const amount = PLAN_PRICES_RUB[planKey]
  const idempotenceKey = crypto.randomUUID()

  const body = {
    amount: { value: amount.toFixed(2), currency: 'RUB' },
    confirmation: {
      type: 'redirect',
      return_url: `${APP_URL}/dashboard/billing/success?planKey=${planKey}`,
    },
    description: `CV4YOU — ${planKey.replace('_', ' ').toUpperCase()} subscription`,
    metadata: { recruiterId: session.user.id as string, planKey },
    capture: true,
  }

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64')}`,
        'Idempotence-Key': idempotenceKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[yookassa create]', err)
      return NextResponse.json({ error: 'Payment service error' }, { status: 502 })
    }

    const payment = await response.json()

    // Store pending transaction
    await prisma.paymentTransaction.create({
      data: {
        recruiterId: session.user.id as string,
        yookassaPaymentId: payment.id,
        status: 'pending',
        amount,
        planKey,
        daysGranted: PLAN_DAYS[planKey],
      },
    })

    return NextResponse.json({ confirmationUrl: payment.confirmation.confirmation_url })
  } catch (error) {
    console.error('[yookassa create]', error)
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}
