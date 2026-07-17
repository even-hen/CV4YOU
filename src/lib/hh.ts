import { prisma } from './prisma'
import { encrypt, decrypt } from './encryption'

const HH_API_URL = 'https://api.hh.ru'
const CLIENT_ID = process.env.HH_CLIENT_ID || ''
const CLIENT_SECRET = process.env.HH_CLIENT_SECRET || ''
const REDIRECT_URI = process.env.HH_REDIRECT_URI || ''
const USER_AGENT = process.env.HH_USER_AGENT || 'CV4YOU/1.0.0 (contact@cv4you.ru)'

export interface HhTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

export async function exchangeCodeForTokens(code: string): Promise<HhTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
  })

  const res = await fetch('https://hh.ru/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to exchange code for tokens: ${errorText}`)
  }

  return res.json()
}

async function refreshHhToken(refreshToken: string): Promise<HhTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  })

  const res = await fetch('https://hh.ru/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to refresh token: ${errorText}`)
  }

  return res.json()
}

/**
 * Returns an authenticated fetch client for a given user.
 * Handles token decryption and automatic token refreshing if expired or expiring soon.
 */
export async function getHhClient(userId: string) {
  const integration = await prisma.hhIntegration.findUnique({
    where: { userId },
  })

  if (!integration) {
    return null
  }

  let accessToken = decrypt(integration.accessToken)
  let refreshToken = decrypt(integration.refreshToken)
  let expiresAt = new Date(integration.expiresAt)

  // If token is expired or close to expiry (within 5 minutes)
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    try {
      console.log(`[hh] Token for user ${userId} is expiring soon. Refreshing...`)
      const tokens = await refreshHhToken(refreshToken)
      
      accessToken = tokens.access_token
      refreshToken = tokens.refresh_token
      expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

      await prisma.hhIntegration.update({
        where: { userId },
        data: {
          accessToken: encrypt(accessToken),
          refreshToken: encrypt(refreshToken),
          expiresAt,
        },
      })
      console.log(`[hh] Token for user ${userId} refreshed successfully.`)
    } catch (err) {
      console.error(`[hh] Failed to refresh token for user ${userId}:`, err)
      
      // Deactivate integration on authorization failure (e.g. invalid_grant)
      await prisma.hhIntegration.delete({ where: { userId } }).catch(() => {})
      
      // Send an in-app notification to the recruiter
      await prisma.notification.create({
        data: {
          recruiterId: userId,
          message: 'Your HeadHunter connection has expired or been revoked. Please reconnect in Settings.',
          link: '/dashboard/settings',
        },
      }).catch(() => {})

      throw new Error('HH_AUTH_REVOKED')
    }
  }

  return {
    userId,
    async request(endpoint: string, options: RequestInit = {}) {
      const url = endpoint.startsWith('http') ? endpoint : `${HH_API_URL}${endpoint}`
      const headers = new Headers(options.headers || {})
      headers.set('Authorization', `Bearer ${accessToken}`)
      headers.set('User-Agent', USER_AGENT)
      headers.set('HH-User-Agent', USER_AGENT)

      const response = await fetch(url, { ...options, headers })

      if (response.status === 401) {
        // Throw a well-known error — callers are responsible for deactivating the
        // integration and notifying the user, so we don't do side-effects here.
        console.warn(`[hh] API returned 401 Unauthorized for user ${userId}.`)
        throw new Error('HH_AUTH_REVOKED')
      }

      return response
    }
  }
}
