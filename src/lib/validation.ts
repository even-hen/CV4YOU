import { z } from 'zod'

export const RegisterSchema = z.object({
  name: z.string().max(100).optional(),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
})

export const VacancyCreateSchema = z.object({
  company: z.string().min(1).max(200).transform(s => s.trim()),
  role: z.string().min(1).max(200).transform(s => s.trim()),
  responsibilities: z.string().min(1).max(10000).transform(s => s.trim()),
  baseRequirements: z.string().min(1).max(10000).transform(s => s.trim()),
  mandatoryRequirements: z.string().max(10000).default('').transform(s => s.trim()),
  niceToHave: z.string().max(10000).default('').transform(s => s.trim()),
  requestedContacts: z.array(z.enum(['phone', 'telegram', 'email'])).default([]),
  salaryExpectation: z.enum(['optional', 'required', '']).nullable().default(null),
  knockoutQuestions: z.array(z.object({
    question: z.string().min(1).max(500),
    options: z.array(z.string().max(200)).min(2).max(10),
    correctAnswer: z.number().int().min(0),
  })).default([]),
  linkEnabled: z.boolean().default(true),
  isActive: z.boolean().default(true),
})

export const ApplySchema = z.object({
  candidateName: z.string().min(1).max(200).transform(s => s.trim()),
  contacts: z.record(z.string(), z.string().max(200)).default({}),
  salaryExpectation: z.string().max(100).nullable().optional(),
  knockoutAnswers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
    answerIndex: z.number().optional(),
  })).default([]),
  extractedText: z.string().min(50).max(100000).transform(s => s.trim()),
})

export const CandidatePatchSchema = z.object({
  seen: z.boolean(),
})

export const SettingsSchema = z.object({
  name: z.string().max(100).nullable().optional(),
  emailNotificationsEnabled: z.boolean(),
  minScoreEmailNotif: z.number().int().min(0).max(100).default(50),
  preferredLanguage: z.enum([
    'Russian', 'English', 'Kazakh', 'Uzbek', 'Belarusian', 'Ukrainian', 'German', 'French', 'Spanish', 'Chinese',
  ]).default('Russian'),
})

export const ThemeSchema = z.object({
  theme: z.enum(['dark', 'light']),
})
