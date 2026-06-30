import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { verifyPassword } from '@/lib/password'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })

        if (!user) return null

        const valid = await verifyPassword(credentials.password as string, user.passwordHash)
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          subscriptionTier: user.subscriptionTier,
          trialEndsAt: user.trialEndsAt.toISOString(),
          subscriptionEndsAt: user.subscriptionEndsAt?.toISOString() ?? null,
          preferredTheme: user.preferredTheme,
          preferredLanguage: user.preferredLanguage,
          emailNotificationsEnabled: user.emailNotificationsEnabled,
          minScoreEmailNotif: user.minScoreEmailNotif,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === 'update') {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
        })
        if (dbUser) {
          token.name = dbUser.name
          token.subscriptionTier = dbUser.subscriptionTier
          token.trialEndsAt = dbUser.trialEndsAt.toISOString()
          token.subscriptionEndsAt = dbUser.subscriptionEndsAt?.toISOString() ?? null
          token.preferredTheme = dbUser.preferredTheme
          token.preferredLanguage = dbUser.preferredLanguage
          token.emailNotificationsEnabled = dbUser.emailNotificationsEnabled
          token.minScoreEmailNotif = dbUser.minScoreEmailNotif
        }
      }
      if (user) {
        token.id = user.id
        token.name = user.name
        token.subscriptionTier = user.subscriptionTier
        token.trialEndsAt = user.trialEndsAt
        token.subscriptionEndsAt = user.subscriptionEndsAt
        token.preferredTheme = user.preferredTheme
        token.preferredLanguage = user.preferredLanguage
        token.emailNotificationsEnabled = user.emailNotificationsEnabled
        token.minScoreEmailNotif = user.minScoreEmailNotif
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        if (token.name) {
          session.user.name = token.name as string
        }
        session.user.subscriptionTier = token.subscriptionTier
        session.user.trialEndsAt = token.trialEndsAt
        session.user.subscriptionEndsAt = token.subscriptionEndsAt
        session.user.preferredTheme = token.preferredTheme
        session.user.preferredLanguage = token.preferredLanguage
        session.user.emailNotificationsEnabled = token.emailNotificationsEnabled
        session.user.minScoreEmailNotif = token.minScoreEmailNotif
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
})
