/**
 * Lightweight auth config for middleware (no Prisma, no Node-only modules).
 * Uses JWT strategy — no DB lookups needed at middleware layer.
 */
import NextAuth from 'next-auth'

export const { auth } = NextAuth({
  providers: [],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
})
