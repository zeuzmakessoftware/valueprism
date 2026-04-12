import {
  type AnalysisResult,
  type QuestionPlanCompletePayload,
  type QuestionPlanErrorPayload,
  type QuestionPlanProgressPayload,
  QUESTION_PLAN_STAGE_DETAILS,
  QUESTION_PLAN_STAGE_SEQUENCE
} from '@/lib/question-plan'
import { fetchWithTimeout, HttpStatusError, isRetriableError, withRetries } from '@/lib/retry'
import { fetchLatestTenK, resolveSecCompany } from '@/lib/sec'

export const runtime = 'nodejs'

type GeminiInlineData = {
  mimeType: string
  data: string
}

type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
}

type GeneratedQuestion = {
  businessUnit: string
  question: string
}

type GeminiPlanPayload = {
  businessUnits?: unknown
  questions?: unknown
}

const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/plain',
  'text/xml'
])

const INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
])

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  md: 'text/markdown',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
  webp: 'image/webp',
  xml: 'application/xml'
}

const MAX_DOCUMENTS = 6
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_DOCUMENT_BYTES = 20 * 1024 * 1024
const MAX_TEXT_DOCUMENT_CHARS = 40000
const MAX_TEN_K_CONTEXT_CHARS = 60000
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_REQUEST_TIMEOUT_MS = 45000
const GEMINI_REQUEST_ATTEMPTS = 3

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
}

function inferMimeType(file: File) {
  if (file.type) {
    return file.type
  }

  const extension = file.name.split('.').pop()?.toLowerCase()

  if (!extension) {
    return 'application/octet-stream'
  }

  return MIME_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#160;|&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/section|\/article|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function collectSnippetRanges(text: string) {
  const windows: Array<{ start: number; end: number }> = []
  const patterns = [
    /\bitem\s+1\b.{0,40}\bbusiness\b/gi,
    /\boperating segments?\b/gi,
    /\breportable segments?\b/gi,
    /\bsegment information\b/gi,
    /\bproducts? and services\b/gi,
    /\bgeographic areas?\b/gi
  ]

  for (const pattern of patterns) {
    let matchCount = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) && matchCount < 2) {
      const start = Math.max(0, match.index - 900)
      const end = Math.min(text.length, match.index + 5200)
      windows.push({ start, end })
      matchCount += 1
    }
  }

  return windows
    .sort((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((merged, current) => {
      const previous = merged[merged.length - 1]

      if (!previous || current.start > previous.end) {
        merged.push(current)
        return merged
      }

      previous.end = Math.max(previous.end, current.end)
      return merged
    }, [])
}

function extractTenKContext(filingContent: string) {
  const text = filingContent.includes('<') ? stripHtml(filingContent) : filingContent.trim()
  const normalized = text.replace(/\u00a0/g, ' ').replace(/\s+\n/g, '\n').trim()
  const ranges = collectSnippetRanges(normalized)

  if (ranges.length === 0) {
    return normalized.slice(0, MAX_TEN_K_CONTEXT_CHARS)
  }

  return ranges
    .map((range) => normalized.slice(range.start, range.end).trim())
    .join('\n\n---\n\n')
    .slice(0, MAX_TEN_K_CONTEXT_CHARS)
}

async function fileToGeminiParts(file: File): Promise<GeminiPart[]> {
  const mimeType = inferMimeType(file)
  const buffer = Buffer.from(await file.arrayBuffer())

  if (buffer.byteLength === 0) {
    throw new Error(`Uploaded file "${file.name}" is empty`)
  }

  if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error(`Uploaded file "${file.name}" exceeds the 10 MB limit`)
  }

  if (TEXT_MIME_TYPES.has(mimeType)) {
    const rawText = buffer.toString('utf8')
    const text = mimeType === 'text/html' ? stripHtml(rawText) : rawText.trim()

    if (!text) {
      throw new Error(`Uploaded file "${file.name}" did not contain readable text`)
    }

    return [
      {
        text: `Uploaded document: ${file.name}\n\n${text.slice(0, MAX_TEXT_DOCUMENT_CHARS)}`
      }
    ]
  }

  if (INLINE_MIME_TYPES.has(mimeType)) {
    return [
      {
        text: `Uploaded document: ${file.name}`
      },
      {
        inlineData: {
          mimeType,
          data: buffer.toString('base64')
        }
      }
    ]
  }

  throw new Error(
    `Unsupported file type for "${file.name}". Upload PDF, TXT, Markdown, HTML, CSV, JSON, or common image formats.`
  )
}

function extractJsonObject(value: string) {
  const firstBrace = value.indexOf('{')
  const lastBrace = value.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('Gemini did not return a JSON object')
  }

  return value.slice(firstBrace, lastBrace + 1)
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  )
}

function fallbackQuestionForUnit(unit: string, index: number): GeneratedQuestion {
  const prompts = [
    `What evidence in the uploaded documents changes the outlook for ${unit} relative to how management frames it in the 10-K?`,
    `Which customers, products, or geographies in the uploaded documents appear most material to ${unit}, and why?`,
    `What operational, regulatory, or execution risks for ${unit} are surfaced in the uploaded documents?`,
    `What do the uploaded documents imply about demand, pricing, margins, or investment priorities for ${unit}?`
  ]

  return {
    businessUnit: unit,
    question: prompts[index % prompts.length]
  }
}

function normalizePlan(payload: GeminiPlanPayload) {
  const rawBusinessUnits = Array.isArray(payload.businessUnits) ? payload.businessUnits : []
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : []

  const questions = rawQuestions
    .map((entry): GeneratedQuestion | null => {
      if (typeof entry === 'string') {
        return {
          businessUnit: '',
          question: entry.trim()
        }
      }

      if (!entry || typeof entry !== 'object') {
        return null
      }

      const businessUnit =
        'businessUnit' in entry && typeof entry.businessUnit === 'string' ? entry.businessUnit.trim() : ''
      const question = 'question' in entry && typeof entry.question === 'string' ? entry.question.trim() : ''

      if (!question) {
        return null
      }

      return {
        businessUnit,
        question
      }
    })
    .filter((entry): entry is GeneratedQuestion => Boolean(entry))

  const businessUnits = uniqueStrings([
    ...rawBusinessUnits.filter((entry): entry is string => typeof entry === 'string'),
    ...questions.map((entry) => entry.businessUnit)
  ]).slice(0, 6)

  if (businessUnits.length === 0) {
    throw new Error('Gemini did not identify any business units')
  }

  const completedQuestions = questions
    .map((entry, index) => ({
      businessUnit: entry.businessUnit || businessUnits[index % businessUnits.length],
      question: entry.question
    }))
    .slice(0, 4)

  while (completedQuestions.length < 4) {
    const unit = businessUnits[completedQuestions.length % businessUnits.length]
    completedQuestions.push(fallbackQuestionForUnit(unit, completedQuestions.length))
  }

  return {
    businessUnits,
    questions: completedQuestions
  }
}

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const candidates: unknown[] =
    'candidates' in payload && Array.isArray(payload.candidates) ? payload.candidates : []

  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return []
      }

      const content = 'content' in candidate ? candidate.content : undefined

      if (!content || typeof content !== 'object') {
        return []
      }

      const parts: unknown[] = 'parts' in content && Array.isArray(content.parts) ? content.parts : []

      return parts
        .map((part: unknown) => {
          if (!part || typeof part !== 'object') {
            return ''
          }

          return 'text' in part && typeof part.text === 'string' ? part.text : ''
        })
        .filter(Boolean)
    })
    .join('')
    .trim()
}

async function readErrorDetail(response: Response) {
  try {
    const payload = await response.json()

    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = payload.error

      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message
      }
    }

    return JSON.stringify(payload)
  } catch {
    return response.text()
  }
}

async function generateQuestionPlan({
  companyName,
  companyTicker,
  filingDate,
  filingUrl,
  tenKContext,
  documentParts,
  onProgress
}: {
  companyName: string
  companyTicker: string
  filingDate: string
  filingUrl: string
  tenKContext: string
  documentParts: GeminiPart[]
  onProgress?: (description: string) => void
}) {
  const apiKey = getGeminiApiKey()

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY')
  }

  const model = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
  const prompt = [
    'You are preparing step 4 analyst questions for a document review workflow.',
    '',
    `Company: ${companyName} (${companyTicker})`,
    `Latest 10-K filing date: ${filingDate}`,
    `Latest 10-K source: ${filingUrl}`,
    '',
    'Instructions:',
    '1. Use the 10-K excerpt to identify 3 to 6 real business units, operating segments, or product lines. Prefer the company’s own language.',
    '2. Review the uploaded documents and produce exactly 4 questions for a reviewer to answer from those documents.',
    '3. Each question must map to one business unit and should help a reviewer compare the uploaded documents against the priorities implied by the 10-K.',
    '4. Ask only questions that can plausibly be answered from the uploaded documents. Avoid yes/no phrasing and avoid generic summary prompts.',
    '5. Return JSON only with this shape:',
    '{',
    '  "businessUnits": ["unit"],',
    '  "questions": [',
    '    { "businessUnit": "unit", "question": "question" }',
    '  ]',
    '}',
    '',
    'Relevant 10-K excerpt:',
    tenKContext
  ].join('\n')

  return withRetries(
    async () => {
      onProgress?.('Submitting the document package to Gemini.')
      const requestStartedAt = Date.now()
      const heartbeat = setInterval(() => {
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - requestStartedAt) / 1000))
        onProgress?.(`Waiting on Gemini to return structured questions. ${elapsedSeconds}s elapsed.`)
      }, 4000)

      try {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }, ...documentParts]
              }
            ]
          })
        },
        GEMINI_REQUEST_TIMEOUT_MS
      )

      if (!response.ok) {
        const detail = await readErrorDetail(response)
        throw new HttpStatusError(response.status, `Gemini request failed: ${detail}`)
      }

      onProgress?.('Gemini responded. Parsing the structured question plan.')
      const payload = await response.json()
      const content = extractGeminiText(payload)

      if (!content) {
        throw new Error('Gemini returned an empty response')
      }

      const parsed = JSON.parse(extractJsonObject(content)) as GeminiPlanPayload
      onProgress?.('Question plan parsed successfully. Preparing the final response.')
      return normalizePlan(parsed)
      } finally {
        clearInterval(heartbeat)
      }
    },
    {
      attempts: GEMINI_REQUEST_ATTEMPTS,
      shouldRetry: (error) =>
        isRetriableError(error) ||
        (error instanceof Error &&
          ['Gemini returned an empty response', 'Gemini did not return a JSON object'].includes(error.message))
    }
  )
}

function createQuestionPlanStream(request: Request) {
  const encoder = new TextEncoder()

  return new Response(
    new ReadableStream({
      start(controller) {
        const emit = <T>(event: string, payload: T) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`))
        }

        const emitProgress = (payload: QuestionPlanProgressPayload) => {
          emit('progress', payload)
        }

        const emitError = (message: string) => {
          const payload: QuestionPlanErrorPayload = { message }
          emit('error', payload)
        }

        const emitComplete = (result: AnalysisResult) => {
          const payload: QuestionPlanCompletePayload = { result }
          emit('complete', payload)
        }

        const run = async () => {
          try {
            controller.enqueue(encoder.encode(': connected\n\n'))

            emitProgress({
              stageId: QUESTION_PLAN_STAGE_SEQUENCE[0],
              ...QUESTION_PLAN_STAGE_DETAILS['preparing-analysis']
            })

            const formData = await request.formData()
            const companyNameValue = formData.get('companyName')
            const companyTickerValue = formData.get('companyTicker')
            const rawDocuments = formData.getAll('documents')

            if (typeof companyNameValue !== 'string' || !companyNameValue.trim()) {
              throw new Error('companyName is required')
            }

            const documents = rawDocuments.filter((entry): entry is File => entry instanceof File)

            if (documents.length === 0) {
              throw new Error('At least one uploaded document is required')
            }

            if (documents.length > MAX_DOCUMENTS) {
              throw new Error(`Upload no more than ${MAX_DOCUMENTS} documents at a time`)
            }

            const totalBytes = documents.reduce((sum, file) => sum + file.size, 0)

            if (totalBytes > MAX_TOTAL_DOCUMENT_BYTES) {
              throw new Error('The combined upload size exceeds the 20 MB limit')
            }

            emitProgress({
              stageId: QUESTION_PLAN_STAGE_SEQUENCE[1],
              title: QUESTION_PLAN_STAGE_DETAILS['resolving-company'].title,
              description: `Resolving "${companyNameValue.trim()}" against the SEC company records.`
            })

            const company = await resolveSecCompany(
              companyNameValue,
              typeof companyTickerValue === 'string' ? companyTickerValue : undefined
            )

            emitProgress({
              stageId: QUESTION_PLAN_STAGE_SEQUENCE[2],
              title: QUESTION_PLAN_STAGE_DETAILS['loading-10k'].title,
              description: `Fetching the latest 10-K for ${company.title} (${company.ticker}).`
            })

            const latestTenK = await fetchLatestTenK(company)

            emitProgress({
              stageId: QUESTION_PLAN_STAGE_SEQUENCE[3],
              title: QUESTION_PLAN_STAGE_DETAILS['extracting-business-units'].title,
              description: `Extracting business-unit context from the ${latestTenK.filingDate} annual filing.`
            })

            const tenKContext = extractTenKContext(latestTenK.content)

            emitProgress({
              stageId: QUESTION_PLAN_STAGE_SEQUENCE[4],
              title: QUESTION_PLAN_STAGE_DETAILS['preparing-documents'].title,
              description: `Preparing ${documents.length} uploaded ${documents.length === 1 ? 'document' : 'documents'} for Gemini.`
            })

            const documentParts: GeminiPart[] = []

            for (const [index, file] of documents.entries()) {
              const parts = await fileToGeminiParts(file)
              documentParts.push(...parts)

              emitProgress({
                stageId: QUESTION_PLAN_STAGE_SEQUENCE[4],
                title: QUESTION_PLAN_STAGE_DETAILS['preparing-documents'].title,
                description: `Prepared ${index + 1} of ${documents.length}: ${file.name}`
              })
            }

            emitProgress({
              stageId: QUESTION_PLAN_STAGE_SEQUENCE[5],
              title: QUESTION_PLAN_STAGE_DETAILS['generating-questions'].title,
              description: `Sending the filing context and uploaded materials to Gemini for ${company.title}.`
            })

            const plan = await generateQuestionPlan({
              companyName: company.title,
              companyTicker: company.ticker,
              filingDate: latestTenK.filingDate,
              filingUrl: latestTenK.url,
              tenKContext,
              documentParts,
              onProgress: (description) => {
                emitProgress({
                  stageId: QUESTION_PLAN_STAGE_SEQUENCE[5],
                  title: QUESTION_PLAN_STAGE_DETAILS['generating-questions'].title,
                  description
                })
              }
            })

            emitProgress({
              stageId: QUESTION_PLAN_STAGE_SEQUENCE[6],
              title: QUESTION_PLAN_STAGE_DETAILS['finalizing-response'].title,
              description: `Finalizing ${plan.questions.length} tailored review questions.`
            })

            emitComplete({
              company: {
                name: company.title,
                ticker: company.ticker
              },
              latestTenK: {
                filingDate: latestTenK.filingDate,
                accessionNumber: latestTenK.accessionNumber,
                url: latestTenK.url
              },
              businessUnits: plan.businessUnits,
              questions: plan.questions
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to generate question plan'
            emitError(message)
          } finally {
            controller.close()
          }
        }

        void run()
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    }
  )
}

export async function POST(request: Request) {
  return createQuestionPlanStream(request)
}
