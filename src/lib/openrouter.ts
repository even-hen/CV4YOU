/**
 * OpenRouter LLM service
 * Uses native Node.js https to bypass undici's 10s connect timeout limitation.
 * Returns structured JSON for CV evaluation and on-demand CV generation.
 */

import https from 'https'
import { URL } from 'url'

const BASE_URL = process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1'
const MODEL = process.env.LLM_MODEL_NAME || ''
const API_KEY = process.env.LLM_API_KEY || ''

/** Strip markdown code fences that some models wrap JSON in */
function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1)
  return raw.trim()
}

/** Native https POST — avoids undici connect timeout issues */
function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 120_000, // 2 minute socket timeout
    }

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`OpenRouter error ${res.statusCode}: ${text}`))
        } else {
          resolve(text)
        }
      })
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('OpenRouter request timed out after 120s'))
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function httpsPostWithRetry(
  url: string,
  headers: Record<string, string>,
  body: string,
  retries = 3,
  delay = 1000
): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await httpsPost(url, headers, body)
    } catch (err: any) {
      const isLast = attempt === retries
      const shouldRetry =
        err.message.includes('429') ||
        /\b5\d{2}\b/.test(err.message) ||
        err.message.includes('timed out') ||
        err.message.includes('timeout') ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'EADDRNOTAVAIL'

      if (isLast || !shouldRetry) {
        throw err
      }

      console.warn(
        `[openrouter] Attempt ${attempt} failed: ${err.message || err}. Retrying in ${delay * attempt}ms...`
      )
      await new Promise((resolve) => setTimeout(resolve, delay * attempt))
    }
  }
  throw new Error('All retry attempts failed')
}

export interface LLMScoreResult {
  overallScore: number        // 0-100
  summary: string
  pros: string[]
  cons: string[]
  breakdown: {
    baseRequirements: number  // 0-100
    niceToHave: number        // 0-100
  }
}

export async function scoreCVAgainstVacancy(params: {
  responsibilities: string
  baseRequirements: string
  mandatoryRequirements: string
  niceToHave: string
  cvText: string
  language?: string
}): Promise<LLMScoreResult> {
  const language = params.language || 'Russian'
  const systemPrompt = `You are an expert HR analyst. Evaluate a candidate's CV against a job vacancy.
Return ONLY a valid JSON object with this exact shape (no markdown, no extra text) and all text values in ${language}:
{
  "overallScore": <integer 0-100>,
  "summary": "<2-3 sentence overview>",
  "pros": ["<strength 1>", "<strength 2>", ...],
  "cons": ["<gap 1>", "<gap 2>", ...],
  "breakdown": {
    "baseRequirements": <integer 0-100>,
    "niceToHave": <integer 0-100>
  }
}
Scoring rules:
- Mandatory requirements carry the highest weight. Missing any mandatory requirement significantly lowers the score.
- Base requirements are important but not absolute.
- Nice-to-have requirements are bonus points.
- Be honest and precise. Do not inflate scores.`

  const userPrompt = `## Job Vacancy

**Responsibilities:**
${params.responsibilities}

**Base Requirements:**
${params.baseRequirements}

**Mandatory Requirements:**
${params.mandatoryRequirements}

**Nice to Have:**
${params.niceToHave}

## Candidate CV Text

${params.cvText}

Evaluate this candidate and return only the JSON object.`

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 2048,
  })

  const text = await httpsPostWithRetry(`${BASE_URL}/chat/completions`, {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'CV4YOU',
  }, body)

  const data = JSON.parse(text)
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from LLM')

  return JSON.parse(extractJSON(content)) as LLMScoreResult
}

export async function generateStructuredCV(extractedText: string): Promise<string> {
  const systemPrompt = `You are a professional resume writer. Transform raw CV text into a clean, structured professional resume in plain text format. 
Use clear section headers (CONTACT INFORMATION, PROFESSIONAL SUMMARY, WORK EXPERIENCE, EDUCATION, SKILLS, etc.).
Keep all factual information from the original text. Do not add anything that isn't in the original.
Return only plain text, no markdown symbols like **, ##, etc.`

  const userPrompt = `Here is the raw extracted text from a candidate's CV. Please restructure it into a clean, professional resume:\n\n${extractedText}`

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  })

  const text = await httpsPostWithRetry(`${BASE_URL}/chat/completions`, {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'CV4YOU',
  }, body)

  const data = JSON.parse(text)
  return data.choices?.[0]?.message?.content || ''
}
