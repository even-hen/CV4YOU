import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exchangeCodeForTokens } from '@/lib/hh'
import { encrypt } from '@/lib/encryption'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const USER_AGENT = process.env.HH_USER_AGENT || 'CV4YOU/1.0.0 (contact@cv4you.ru)'

/**
 * Verifies the HMAC-signed state returned by hh.ru and extracts the userId.
 * Returns the userId if valid, or null if the state is tampered/invalid.
 */
function verifyState(state: string, expectedUserId: string): boolean {
  const [userId, hmac] = state.split('.')
  if (!userId || !hmac || userId !== expectedUserId) return false
  const secret = process.env.HH_ENCRYPTION_KEY || 'default-dev-key-must-be-changed-in-production-12345'
  const expectedHmac = crypto.createHmac('sha256', secret).update(userId).digest('hex')
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // We redirect back to settings in case of failure or success
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectSuccessUrl = `${appUrl}/dashboard/settings?hh=success`
  const redirectErrorUrl = `${appUrl}/dashboard/settings?hh=error`

  if (!code || !state) {
    console.warn('[hh/callback] Missing code or state parameters')
    return NextResponse.redirect(redirectErrorUrl)
  }

  const session = await auth()
  if (!session?.user) {
    console.warn('[hh/callback] No active recruiter session')
    return NextResponse.redirect(redirectErrorUrl)
  }

  const userId = session.user.id
  if (!verifyState(state, userId)) {
    console.warn('[hh/callback] CSRF validation failed: state HMAC is invalid or userId mismatch')
    return NextResponse.redirect(redirectErrorUrl)
  }

  try {
    // 1 — Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)
    
    // 2 — Query /me to get recruiter profile details
    const meRes = await fetch('https://api.hh.ru/me', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'User-Agent': USER_AGENT,
        'HH-User-Agent': USER_AGENT,
      }
    })

    if (!meRes.ok) {
      const errorText = await meRes.text()
      throw new Error(`Failed to query /me: ${errorText}`)
    }

    const meData = await meRes.json()
    const hhUserId = meData.id || null
    const employerId = meData.employer?.id || null

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    // 3 — Encrypt and save to database
    const encryptedAccess = encrypt(tokens.access_token)
    const encryptedRefresh = encrypt(tokens.refresh_token)

    await prisma.hhIntegration.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        hhUserId,
        employerId,
      },
      update: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        hhUserId,
        employerId,
      }
    })

    console.log(`[hh/callback] Successfully integrated HeadHunter account for user ${userId}`)
    return NextResponse.redirect(redirectSuccessUrl)
  } catch (err) {
    console.error('[hh/callback] OAuth callback failed:', err)
    return NextResponse.redirect(redirectErrorUrl)
  }
}
