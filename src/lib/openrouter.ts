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

if (!API_KEY) {
  console.warn('[openrouter] LLM_API_KEY is not set — LLM calls will fail')
}

/** Default headers for OpenRouter API requests */
function getDefaultHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'X-Title': 'CV4YOU',
  }
}

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
      port: Number(parsed.port) || 443,
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
}

export async function scoreCVAgainstVacancy(params: {
  responsibilities?: string
  baseRequirements: string
  mandatoryRequirements: string
  niceToHave: string
  cvText: string
  language?: string
}): Promise<LLMScoreResult> {
  const language = params.language || 'Russian'
  const systemPrompt = `You are an expert AI recruitment analyst. Your task is to evaluate a candidate's CV against a job vacancy.
This evaluation must be objective, analytical, and tailored strictly to the evidence present in the text.
Return ONLY a valid JSON object with this exact shape (no markdown, no extra text).
All text values must be in ${language}.

{
  "overallScore": <integer 0-100>,
  "summary": "<2-3 sentence overview>",
  "pros": ["<strength>", ...],
  "cons": ["<gap>", ...],
}

Scoring rules:
- Start from 100 and deduct points.
- Each missing mandatory requirement: deduct 10 points.
- Each missing base requirement: deduct 5 points.
- Nice-to-have matches add +2 to +5 bonus points each (cap total at 100).
- If a mandatory requirement is completely absent, cap overallScore at 60.
- Provide 3-5 strengths in "pros" and 3-5 gaps in "cons".
- Be precise and honest. Do not inflate or deflate scores.`

  const responsibilitiesBlock = params.responsibilities
    ? `**Responsibilities:**\n${params.responsibilities}\n\n`
    : ''

  const userPrompt = `## Job Vacancy

${responsibilitiesBlock}

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
    temperature: 0.1,
    max_tokens: 500,
  })

  const text = await httpsPostWithRetry(`${BASE_URL}/chat/completions`, getDefaultHeaders(), body)

  const data = JSON.parse(text)
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from LLM')

  const result = JSON.parse(extractJSON(content))
  if (
    typeof result.overallScore !== 'number' ||
    typeof result.summary !== 'string' ||
    !Array.isArray(result.pros) ||
    !Array.isArray(result.cons)
  ) {
    throw new Error(`LLM returned unexpected JSON shape: ${JSON.stringify(result).slice(0, 200)}`)
  }
  return result as LLMScoreResult
}

export async function generateStructuredCV(extractedText: string): Promise<string> {
  if (!extractedText?.trim()) {
    throw new Error('No CV text to restructure')
  }

  const systemPrompt = `You are a professional resume writer. Transform raw CV text into a clean, structured professional resume in plain text format.
Use clear section headers (CONTACT INFORMATION, PROFESSIONAL SUMMARY, WORK EXPERIENCE, EDUCATION, SKILLS, etc.).
Keep all factual information from the original text. Do not add anything that isn't in the original.
Preserve the original language of the CV.
Return only plain text, no markdown symbols like **, ##, etc.`

  const userPrompt = `Here is the raw extracted text from a candidate's CV. Please restructure it into a clean, professional resume:\n\n${extractedText}`

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.1,
    max_tokens: 8000,
  })

  const text = await httpsPostWithRetry(`${BASE_URL}/chat/completions`, getDefaultHeaders(), body)

  const data = JSON.parse(text)
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Empty response from LLM')
  return content
}
