import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_REQUEST_ATTEMPTS,
  GEMINI_REQUEST_TIMEOUT_MS,
  type GeminiPart,
  extractGeminiText,
  extractJsonObject,
  fileToGeminiParts,
  getGeminiApiKey,
  readErrorDetail,
  validateUploadedDocuments
} from '@/lib/gemini'
import type { AnalysisResult } from '@/lib/question-plan'
import { fetchWithTimeout, HttpStatusError, isRetriableError, withRetries } from '@/lib/retry'
import {
  type MatterProfile,
  type PricingCurvePoint,
  type PricingSummary,
  type ValueDimensionKey,
  buildMatterProfileContext,
  buildPricingSummary,
  buildDefaultPricingGraphMoments,
  clamp,
  roundCurrency
} from '@/lib/value-pricing'

export const runtime = 'nodejs'

type GeminiDimensionPayload = {
  key?: unknown
  label?: unknown
  description?: unknown
  score?: unknown
  amount?: unknown
}

type GeminiCurvePointPayload = {
  label?: unknown
  floor?: unknown
  recommended?: unknown
  ceiling?: unknown
}

type GeminiPricingPayload = {
  executiveSummary?: unknown
  pricingNarrative?: unknown
  assumptions?: unknown
  marketSignalLabel?: unknown
  biggestDriver?: unknown
  baseValueAtStake?: unknown
  valueAtStake?: unknown
  exposurePercent?: unknown
  feeBandLowPercent?: unknown
  feeBandHighPercent?: unknown
  recommendedFeePercent?: unknown
  priceFloor?: unknown
  recommendedPrice?: unknown
  priceCeiling?: unknown
  documentComplexityScore?: unknown
  dimensions?: unknown
  graphMoments?: unknown
}

function parseJsonField<T>(value: FormDataEntryValue | null, fieldName: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`)
  }

  return JSON.parse(value) as T
}

function maybeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function maybeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = Number(value.replace(/[^0-9.-]+/g, ''))

    if (Number.isFinite(normalized)) {
      return normalized
    }
  }

  return undefined
}

function sanitizeMoney(value: number, fallback: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }

  return roundCurrency(value)
}

function sanitizePercent(value: number, fallback: number, min: number, max: number, precision = 2) {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Number(clamp(value, min, max).toFixed(precision))
}

function normalizeDimensions(payload: unknown, summary: PricingSummary) {
  const rawDimensions = Array.isArray(payload) ? payload : []
  const fallbackByKey = new Map(summary.dimensions.map((dimension) => [dimension.key, dimension]))

  return summary.dimensions.map((dimension, index) => {
    const rawEntry = rawDimensions[index]
    const keyedEntry =
      rawDimensions.find((entry) => {
        if (!entry || typeof entry !== 'object') {
          return false
        }

        return 'key' in entry && entry.key === dimension.key
      }) ?? rawEntry

    const next = keyedEntry && typeof keyedEntry === 'object' ? (keyedEntry as GeminiDimensionPayload) : {}
    const key = maybeString(next.key) as ValueDimensionKey | undefined
    const fallback = key ? fallbackByKey.get(key) ?? dimension : dimension
    const score = sanitizePercent(maybeNumber(next.score) ?? fallback.score, fallback.score, 12, 100, 0)
    const amount = sanitizeMoney(maybeNumber(next.amount) ?? fallback.amount, fallback.amount)

    return {
      ...fallback,
      label: maybeString(next.label) ?? fallback.label,
      description: maybeString(next.description) ?? fallback.description,
      score,
      amount
    }
  })
}

function normalizeAssumptions(payload: unknown, fallback: string[]) {
  const assumptions = Array.isArray(payload)
    ? payload.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    : []

  return assumptions.length > 0 ? assumptions.slice(0, 4) : fallback
}

function normalizeGraphMoments(payload: unknown, summary: PricingSummary) {
  const rawPoints = Array.isArray(payload) ? payload : []
  const fallback = buildDefaultPricingGraphMoments(summary)
  const maxValue = Math.max(summary.priceCeiling * 1.35, summary.recommendedPrice * 1.25, 10000)

  const normalized = rawPoints
    .map((entry): PricingCurvePoint | null => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const point = entry as GeminiCurvePointPayload
      const label = maybeString(point.label)
      const rawFloor = maybeNumber(point.floor)
      const rawRecommended = maybeNumber(point.recommended)
      const rawCeiling = maybeNumber(point.ceiling)

      if (!label || rawFloor === undefined || rawRecommended === undefined || rawCeiling === undefined) {
        return null
      }

      const [floor, recommended, ceiling] = [rawFloor, rawRecommended, rawCeiling]
        .map((value) => roundCurrency(clamp(value, 5000, maxValue)))
        .sort((left, right) => left - right)

      return {
        label,
        floor,
        recommended,
        ceiling
      }
    })
    .filter((entry): entry is PricingCurvePoint => Boolean(entry))

  if (normalized.length < 4) {
    return fallback
  }

  const limited = normalized.slice(0, 6)
  limited[limited.length - 1] = {
    label: limited[limited.length - 1]?.label ?? 'Recommended',
    floor: summary.priceFloor,
    recommended: summary.recommendedPrice,
    ceiling: summary.priceCeiling
  }

  return limited
}

function normalizePricingPayload(payload: GeminiPricingPayload, scaffold: PricingSummary): PricingSummary {
  const baseValueAtStake = sanitizeMoney(
    maybeNumber(payload.baseValueAtStake) ?? scaffold.baseValueAtStake,
    scaffold.baseValueAtStake
  )
  const valueAtStake = sanitizeMoney(maybeNumber(payload.valueAtStake) ?? scaffold.valueAtStake, scaffold.valueAtStake)
  const [priceFloor, recommendedPrice, priceCeiling] = [
    sanitizeMoney(maybeNumber(payload.priceFloor) ?? scaffold.priceFloor, scaffold.priceFloor),
    sanitizeMoney(maybeNumber(payload.recommendedPrice) ?? scaffold.recommendedPrice, scaffold.recommendedPrice),
    sanitizeMoney(maybeNumber(payload.priceCeiling) ?? scaffold.priceCeiling, scaffold.priceCeiling)
  ].sort((left, right) => left - right)

  const derivedLowPercent = (priceFloor / valueAtStake) * 100
  const derivedHighPercent = (priceCeiling / valueAtStake) * 100
  const derivedRecommendedPercent = (recommendedPrice / valueAtStake) * 100

  const next: PricingSummary = {
    ...scaffold,
    executiveSummary: maybeString(payload.executiveSummary) ?? scaffold.executiveSummary,
    pricingNarrative: maybeString(payload.pricingNarrative) ?? scaffold.pricingNarrative,
    assumptions: normalizeAssumptions(payload.assumptions, scaffold.assumptions),
    marketSignalLabel: maybeString(payload.marketSignalLabel) ?? scaffold.marketSignalLabel,
    biggestDriver: maybeString(payload.biggestDriver) ?? scaffold.biggestDriver,
    baseValueAtStake,
    valueAtStake,
    exposurePercent: sanitizePercent(
      maybeNumber(payload.exposurePercent) ?? scaffold.exposurePercent,
      scaffold.exposurePercent,
      0.6,
      9.5
    ),
    feeBandLowPercent: sanitizePercent(
      maybeNumber(payload.feeBandLowPercent) ?? derivedLowPercent,
      scaffold.feeBandLowPercent,
      0.05,
      12
    ),
    feeBandHighPercent: sanitizePercent(
      maybeNumber(payload.feeBandHighPercent) ?? derivedHighPercent,
      scaffold.feeBandHighPercent,
      0.1,
      15
    ),
    recommendedFeePercent: sanitizePercent(
      maybeNumber(payload.recommendedFeePercent) ?? derivedRecommendedPercent,
      scaffold.recommendedFeePercent,
      0.05,
      15
    ),
    priceFloor,
    recommendedPrice,
    priceCeiling,
    documentComplexityScore: sanitizePercent(
      maybeNumber(payload.documentComplexityScore) ?? scaffold.documentComplexityScore,
      scaffold.documentComplexityScore,
      20,
      98,
      0
    ),
    dimensions: scaffold.dimensions,
    graphMoments: scaffold.graphMoments
  }

  const [normalizedLowPercent, normalizedHighPercent] = [next.feeBandLowPercent, next.feeBandHighPercent].sort(
    (left, right) => left - right
  )

  next.feeBandLowPercent = normalizedLowPercent
  next.feeBandHighPercent = normalizedHighPercent
  next.recommendedFeePercent = sanitizePercent(
    next.recommendedFeePercent,
    scaffold.recommendedFeePercent,
    next.feeBandLowPercent,
    next.feeBandHighPercent
  )
  next.dimensions = normalizeDimensions(payload.dimensions, next)
  next.graphMoments = normalizeGraphMoments(payload.graphMoments, next)

  return next
}

async function generateValuePricing({
  analysis,
  answers,
  matterProfileContext,
  heuristicSummary,
  documentParts
}: {
  analysis: AnalysisResult
  answers: string[]
  matterProfileContext: string
  heuristicSummary: PricingSummary
  documentParts: GeminiPart[]
}) {
  const apiKey = getGeminiApiKey()

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY')
  }

  const model = process.env.GEMINI_PRICING_MODEL ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL
  const answeredPrompts = analysis.questions.map((question, index) => ({
    businessUnit: question.businessUnit,
    question: question.question,
    answer: answers[index]?.trim() ?? ''
  }))

  const prompt = [
    'You are preparing structured value-pricing output for a legal services workflow.',
    '',
    'Use every signal provided: company context, client matter calibration, the completed reviewer answers, the uploaded documents, and the heuristic pricing scaffold.',
    'The heuristic scaffold is a baseline, not a script. Adjust it when the written answers and documents support a better recommendation, but keep the output numerically coherent.',
    '',
    `Company: ${analysis.company.name} (${analysis.company.ticker})`,
    `Latest 10-K filing date: ${analysis.latestTenK.filingDate}`,
    `Latest 10-K source: ${analysis.latestTenK.url}`,
    '',
    matterProfileContext,
    '',
    'Completed reviewer answers:',
    JSON.stringify(answeredPrompts, null, 2),
    '',
    'Heuristic pricing scaffold:',
    JSON.stringify(heuristicSummary, null, 2),
    '',
    'Instructions:',
    '1. Return JSON only.',
    '2. Keep all currency values in whole USD numbers.',
    '3. Use these exact dimension keys: riskReduction, transactionEnablement, speedAndCertainty, optionality.',
    '4. Keep priceFloor <= recommendedPrice <= priceCeiling.',
    '5. Keep feeBandLowPercent <= recommendedFeePercent <= feeBandHighPercent.',
    '6. Return 3 or 4 short assumptions.',
    '7. Return 5 or 6 graphMoments. Each graph moment must contain label, floor, recommended, and ceiling in USD legal fee terms.',
    '8. The graphMoments should be allowed to rise and fall based on value, instead of following a single monotonic slope.',
    '9. The final graphMoments entry should represent the final recommended band.',
    '10. Keep the tone direct and executive-ready.',
    '',
    'Response shape:',
    '{',
    '  "executiveSummary": "string",',
    '  "pricingNarrative": "string",',
    '  "assumptions": ["string"],',
    '  "marketSignalLabel": "string",',
    '  "biggestDriver": "string",',
    '  "baseValueAtStake": 0,',
    '  "valueAtStake": 0,',
    '  "exposurePercent": 0,',
    '  "feeBandLowPercent": 0,',
    '  "feeBandHighPercent": 0,',
    '  "recommendedFeePercent": 0,',
    '  "priceFloor": 0,',
    '  "recommendedPrice": 0,',
    '  "priceCeiling": 0,',
    '  "documentComplexityScore": 0,',
    '  "dimensions": [',
    '    {',
    '      "key": "riskReduction",',
    '      "label": "Risk Reduction",',
    '      "description": "string",',
    '      "score": 0,',
    '      "amount": 0',
    '    }',
    '  ],',
    '  "graphMoments": [',
    '    { "label": "Baseline", "floor": 0, "recommended": 0, "ceiling": 0 }',
    '  ]',
    '}'
  ].join('\n')

  return withRetries(
    async () => {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            generationConfig: {
              temperature: 0.3,
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

      const payload = await response.json()
      const content = extractGeminiText(payload)

      if (!content) {
        throw new Error('Valueprism returned an empty pricing response')
      }

      return JSON.parse(extractJsonObject(content)) as GeminiPricingPayload
    },
    {
      attempts: GEMINI_REQUEST_ATTEMPTS,
      shouldRetry: (error) =>
        isRetriableError(error) ||
        (error instanceof Error &&
          ['Valueprism returned an empty pricing response', 'Valueprism did not return a JSON object'].includes(error.message))
    }
  )
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const analysis = parseJsonField<AnalysisResult>(formData.get('analysis'), 'analysis')
    const answers = parseJsonField<string[]>(formData.get('answers'), 'answers')
    const matterProfile = parseJsonField<MatterProfile>(formData.get('matterProfile'), 'matterProfile')
    const rawDocuments = formData.getAll('documents')
    const documents = rawDocuments.filter((entry): entry is File => entry instanceof File)

    validateUploadedDocuments(documents)

    const documentParts: GeminiPart[] = []

    for (const file of documents) {
      const parts = await fileToGeminiParts(file)
      documentParts.push(...parts)
    }

    const matterProfileContextValue = formData.get('matterProfileContext')
    const matterProfileContext =
      typeof matterProfileContextValue === 'string' && matterProfileContextValue.trim()
        ? matterProfileContextValue.trim()
        : buildMatterProfileContext(matterProfile)

    const heuristicSummary = buildPricingSummary(analysis, answers, matterProfile)
    const payload = await generateValuePricing({
      analysis,
      answers,
      matterProfileContext,
      heuristicSummary,
      documentParts
    })
    const result = normalizePricingPayload(payload, heuristicSummary)

    return Response.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate value pricing output'
    return Response.json({ error: message }, { status: 500 })
  }
}
