import { auth } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const CLIENT_ID = process.env.HH_CLIENT_ID || ''
const REDIRECT_URI = process.env.HH_REDIRECT_URI || ''

/**
 * Creates an HMAC-signed, unguessable state parameter that encodes the user ID.
 * Format: `{userId}.{hmac}` where hmac = HMAC-SHA256(userId, HH_ENCRYPTION_KEY).
 * This prevents CSRF without requiring a server-side state store.
 */
function createState(userId: string): string {
  const secret = process.env.HH_ENCRYPTION_KEY || 'default-dev-key-must-be-changed-in-production-12345'
  const hmac = crypto.createHmac('sha256', secret).update(userId).digest('hex')
  return `${userId}.${hmac}`
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const state = createState(userId)

  const authorizeUrl = `https://hh.ru/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&state=${encodeURIComponent(state)}`

  return NextResponse.redirect(authorizeUrl)
}
