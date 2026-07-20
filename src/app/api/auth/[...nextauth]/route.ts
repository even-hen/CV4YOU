import { handlers } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

interface LoginFailureEntry {
  count: number
  resetAt: number
}

const globalForLoginFailures = globalThis as unknown as {
  loginFailures: Map<string, LoginFailureEntry>
}

if (!globalForLoginFailures.loginFailures) {
  globalForLoginFailures.loginFailures = new Map()
}

const loginFailures = globalForLoginFailures.loginFailures

export async function GET(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/api/auth/callback/credentials') {
    return NextResponse.json(
      { error: 'Method Not Allowed' },
      { status: 405, headers: { Allow: 'POST' } }
    )
  }

  return handlers.GET(req)
}

export async function POST(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/api/auth/callback/credentials') {
    const contentType = req.headers.get('content-type') || ''
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || ''

    // 1. Extract CSRF token from request body/header
    let bodyToken: string | null = null
    let email = ''

    try {
      const clonedReq = req.clone()
      if (contentType.includes('application/json')) {
        const json = await clonedReq.json()
        bodyToken = json?.csrfToken
        email = json?.email || json?.username || ''
      } else if (
        contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')
      ) {
        const formData = await clonedReq.formData()
        bodyToken = formData.get('csrfToken') as string | null
        email = (formData.get('email') || formData.get('username') || '') as string
      }
    } catch (e) {
      console.error('[auth-route-body-parse-error]', e)
    }

    const headerToken = req.headers.get('x-csrf-token') || req.headers.get('X-CSRF-Token')
    const finalBodyToken = bodyToken || headerToken

    // 2. Manual CSRF token verification against available CSRF cookies
    const csrfCookies = req.cookies.getAll().filter(c => c.name.includes('csrf-token'))
    if (csrfCookies.length === 0) {
      return NextResponse.json({ error: 'CSRF token missing' }, { status: 403 })
    }

    let validCsrfMatch = false
    let hasInvalidSig = false

    for (const cookie of csrfCookies) {
      const [cookieToken, cookieHash] = (cookie.value || '').split('|')
      if (!cookieToken || !cookieHash) continue

      const expectedHash = crypto
        .createHash('sha256')
        .update(`${cookieToken}${secret}`)
        .digest('hex')

      if (cookieHash !== expectedHash) {
        hasInvalidSig = true
        continue
      }

      if (finalBodyToken && cookieToken === finalBodyToken) {
        validCsrfMatch = true
        break
      }
    }

    if (!validCsrfMatch) {
      if (hasInvalidSig && !finalBodyToken) {
        return NextResponse.json({ error: 'CSRF token signature invalid' }, { status: 403 })
      }
      return NextResponse.json({ error: 'CSRF token mismatch' }, { status: 403 })
    }

    // 2. Brute-force & Account Lockout checks
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    const ipKey = `login_fail_ip:${ip}`
    const emailKey = email ? `login_fail_email:${email.toLowerCase().trim()}` : ''
    const now = Date.now()

    const ipEntry = loginFailures.get(ipKey)
    if (ipEntry && ipEntry.resetAt > now && ipEntry.count >= 10) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    if (emailKey) {
      const emailEntry = loginFailures.get(emailKey)
      if (emailEntry && emailEntry.resetAt > now && emailEntry.count >= 10) {
        return NextResponse.json(
          { error: 'Account is temporarily locked due to repeated login failures.' },
          { status: 423 }
        )
      }
    }

    // 3. Delegate to NextAuth
    const res = await handlers.POST(req)

    // 4. Record/Reset login failures based on results
    let isFailure = false
    if (res.status === 302 || res.status === 307) {
      const location = res.headers.get('location') || ''
      if (location.includes('error=')) {
        isFailure = true
      }
    } else if (res.headers.get('content-type')?.includes('application/json')) {
      try {
        const resClone = res.clone()
        const json = await resClone.json()
        if (json?.error) {
          isFailure = true
        }
      } catch {}
    }

    if (isFailure) {
      const windowMs = 15 * 60 * 1000 // 15 minutes window

      // Increment IP failures
      const currentIpEntry = loginFailures.get(ipKey)
      if (!currentIpEntry || currentIpEntry.resetAt < now) {
        loginFailures.set(ipKey, { count: 1, resetAt: now + windowMs })
      } else {
        currentIpEntry.count++
      }

      // Increment Email failures
      if (emailKey) {
        const currentEmailEntry = loginFailures.get(emailKey)
        if (!currentEmailEntry || currentEmailEntry.resetAt < now) {
          loginFailures.set(emailKey, { count: 1, resetAt: now + windowMs })
        } else {
          currentEmailEntry.count++
        }
      }
    } else {
      // Success: reset failures
      loginFailures.delete(ipKey)
      if (emailKey) {
        loginFailures.delete(emailKey)
      }
    }

    return res
  }

  return handlers.POST(req)
}
