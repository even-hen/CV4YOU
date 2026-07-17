import { auth } from '@/lib/auth-edge'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/jobs') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/jobs') ||
    pathname.startsWith('/api/public') ||
    pathname.startsWith('/api/scoring/trigger') ||
    pathname.startsWith('/api/payments/webhook')

  if (isPublic) return NextResponse.next()

  const session = await auth()

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
}
