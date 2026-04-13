import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_REQUEST_ATTEMPTS,
  GEMINI_REQUEST_TIMEOUT_MS,
  type GeminiPart,
  extractGeminiText,
  extractJsonObject,
  extractTenKContext,
  fileToGeminiParts,
  getGeminiApiKey,
  readErrorDetail,
  validateUploadedDocuments
} from '@/lib/gemini'
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

type GeneratedQuestion = {
  businessUnit: string
  question: string
}

type GeminiPlanPayload = {
  businessUnits?: unknown
  questions?: unknown
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
    `What does the document say about how ${unit} is doing, and does it look better or worse than expected?`,
    `What are the biggest problems or risks mentioned in the document for ${unit}?`
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
    throw new Error('Valueprism did not identify any business units')
  }

  const completedQuestions = questions
    .map((entry, index) => ({
      businessUnit: entry.businessUnit || businessUnits[index % businessUnits.length],
      question: entry.question
    }))
    .slice(0, 2)

  while (completedQuestions.length < 2) {
    const unit = businessUnits[completedQuestions.length % businessUnits.length]
    completedQuestions.push(fallbackQuestionForUnit(unit, completedQuestions.length))
  }

  return {
    businessUnits,
    questions: completedQuestions
  }
}

async function generateQuestionPlan({
  companyName,
  companyTicker,
  filingDate,
  filingUrl,
  matterProfileContext,
  tenKContext,
  documentParts,
  onProgress
}: {
  companyName: string
  companyTicker: string
  filingDate: string
  filingUrl: string
  matterProfileContext: string
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
    'You are preparing structured analyst questions for a document review workflow.',
    '',
    `Company: ${companyName} (${companyTicker})`,
    `Latest 10-K filing date: ${filingDate}`,
    `Latest 10-K source: ${filingUrl}`,
    '',
    matterProfileContext,
    '',
    'Instructions:',
    '1. Use the 10-K excerpt to identify 3 to 6 real business units, operating segments, or product lines. Prefer the company’s own language.',
    '2. Use the client matter calibration to emphasize the business units, risks, stakeholders, and urgency dimensions that appear most important.',
    '3. Review the uploaded documents and produce exactly 2 questions for a reviewer to answer from those documents.',
    '4. Each question must map to one business unit. Keep the questions simple and direct — a high school student should be able to understand them.',
    '5. Ask only questions that can be answered from the uploaded documents. Avoid yes/no questions and avoid vague or overly technical phrasing.',
    '6. Return JSON only with this shape:',
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
      onProgress?.('Submitting the document package to Valueprism.')
      const requestStartedAt = Date.now()
      const heartbeat = setInterval(() => {
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - requestStartedAt) / 1000))
        onProgress?.(`Waiting on Valueprism to return structured questions. ${elapsedSeconds}s elapsed.`)
      }, 15000)

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
        throw new HttpStatusError(response.status, `Valueprism request failed: ${detail}`)
      }

      onProgress?.('Valueprism responded. Parsing the structured question plan.')
      const payload = await response.json()
      const content = extractGeminiText(payload)

      if (!content) {
        throw new Error('Valueprism returned an empty response')
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
          ['Valueprism returned an empty response', 'Valueprism did not return a JSON object'].includes(error.message))
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
            const matterProfileContextValue = formData.get('matterProfileContext')
            const rawDocuments = formData.getAll('documents')

            if (typeof companyNameValue !== 'string' || !companyNameValue.trim()) {
              throw new Error('companyName is required')
            }

            const matterProfileContext =
              typeof matterProfileContextValue === 'string' && matterProfileContextValue.trim()
                ? matterProfileContextValue.trim()
                : 'Client matter calibration: not provided.'

            const documents = rawDocuments.filter((entry): entry is File => entry instanceof File)

            if (documents.length === 0) {
              throw new Error('At least one uploaded document is required')
            }

            validateUploadedDocuments(documents)

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
              description: `Preparing ${documents.length} uploaded ${documents.length === 1 ? 'document' : 'documents'} for Valueprism.`
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
              description: `Sending the filing context, client matter calibration, and uploaded materials to Valueprism for ${company.title}.`
            })

            const plan = await generateQuestionPlan({
              companyName: company.title,
              companyTicker: company.ticker,
              filingDate: latestTenK.filingDate,
              filingUrl: latestTenK.url,
              matterProfileContext,
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
