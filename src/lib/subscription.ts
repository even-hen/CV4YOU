import { User, SubscriptionTier } from '@prisma/client'

export const PLAN_LIMITS: Record<SubscriptionTier, number> = {
  BASIC: 10,
  PRO: 30,
}

export const PLAN_DAYS: Record<string, number> = {
  basic_1m: 30,
  basic_3m: 90,
  basic_1y: 365,
  pro_1m: 30,
  pro_3m: 90,
  pro_1y: 365,
}

export const PLAN_TIER: Record<string, SubscriptionTier> = {
  basic_1m: 'BASIC',
  basic_3m: 'BASIC',
  basic_1y: 'BASIC',
  pro_1m: 'PRO',
  pro_3m: 'PRO',
  pro_1y: 'PRO',
}

export const PLAN_PRICES_RUB: Record<string, number> = {
  basic_1m: 149,
  basic_3m: 399,
  basic_1y: 1299,
  pro_1m: 299,
  pro_3m: 799,
  pro_1y: 2499,
}

export function isAccessActive(): boolean {
  return true
}

export function getEffectiveTier(user: Pick<User, 'subscriptionTier' | 'subscriptionEndsAt'>): SubscriptionTier {
  if (user.subscriptionTier === 'PRO') {
    const now = new Date()
    if (user.subscriptionEndsAt && user.subscriptionEndsAt > now) {
      return 'PRO'
    }
  }
  return 'BASIC'
}

export function getSubscriptionDaysLeft(subscriptionEndsAt: Date | null): number {
  if (!subscriptionEndsAt) return 0
  const now = new Date()
  const diff = subscriptionEndsAt.getTime() - now.getTime()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function getActiveVacancyLimit(tier: SubscriptionTier): number {
  return PLAN_LIMITS[tier]
}

export function extendSubscription(
  user: Pick<User, 'subscriptionEndsAt'>,
  daysToAdd: number
): Date {
  const now = new Date()
  const base =
    user.subscriptionEndsAt && user.subscriptionEndsAt > now
      ? user.subscriptionEndsAt
      : now
  return new Date(base.getTime() + daysToAdd * 24 * 60 * 60 * 1000)
}
