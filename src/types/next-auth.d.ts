import { DefaultSession, DefaultUser } from 'next-auth'
import { DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface User extends DefaultUser {
    id: string
    subscriptionTier: string
    trialEndsAt: string
    subscriptionEndsAt: string | null
    preferredTheme: string
    emailNotificationsEnabled: boolean
    minScoreEmailNotif: number
  }

  interface Session {
    user: {
      id: string
      subscriptionTier: string
      trialEndsAt: string
      subscriptionEndsAt: string | null
      preferredTheme: string
      emailNotificationsEnabled: boolean
      minScoreEmailNotif: number
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    subscriptionTier: string
    trialEndsAt: string
    subscriptionEndsAt: string | null
    preferredTheme: string
    emailNotificationsEnabled: boolean
    minScoreEmailNotif: number
  }
}
