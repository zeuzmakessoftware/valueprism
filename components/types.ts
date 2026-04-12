import {
  type AnalysisResult,
  type QuestionPlanProgressPayload,
  QUESTION_PLAN_STAGE_DETAILS,
  QUESTION_PLAN_STAGE_SEQUENCE,
  type QuestionPlanStageId
} from '@/lib/question-plan'

export type Company = {
  ticker: string
  title: string
}

export type RequestError = Error & {
  status?: number
}

export type ParsedSseMessage = {
  event: string
  data: unknown
}

export type ValuePricingResponsePayload = {
  result: PricingSummary
}

export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type MatterProfileOption = {
  label: string
  score: number
}

export type MatterProfile = {
  businessImpactIndex: number
  footprintIndex: number
  complexityIndex: number
  urgencyIndex: number
  riskProfile: number
  counterpartyIndex: number
  visibilityIndex: number
}

export type MatterProfileSummaryItem = {
  label: string
  selectedLabel: string
  score: number
}

export type ValueDimensionKey =
  | 'riskReduction'
  | 'transactionEnablement'
  | 'speedAndCertainty'
  | 'optionality'

export type ValueDimensionScore = {
  key: ValueDimensionKey
  label: string
  description: string
  score: number
  amount: number
  colorClass: string
}

export type UnitSummary = {
  businessUnit: string
  questionCount: number
  answeredCount: number
  totalWords: number
  sharePercent: number
}

export type PricingCurvePoint = {
  label: string
  floor: number
  recommended: number
  ceiling: number
}

export type PricingSummary = {
  totalQuestions: number
  answeredQuestions: number
  totalWords: number
  averageWords: number
  completionPercent: number
  marketSignalLabel: string
  baseValueAtStake: number
  valueAtStake: number
  exposurePercent: number
  feeBandLowPercent: number
  feeBandHighPercent: number
  recommendedFeePercent: number
  priceFloor: number
  priceCeiling: number
  recommendedPrice: number
  documentComplexityScore: number
  biggestDriver: string
  matterProfileScore: number
  matterProfileAdjustment: number
  matterProfileSignalLabel: string
  riskProfile: number
  dimensions: ValueDimensionScore[]
  units: UnitSummary[]
  highlights: Array<{
    businessUnit: string
    question: string
    preview: string
    words: number
  }>
  filingDateLabel: string
  executiveSummary: string
  pricingNarrative: string
  assumptions: string[]
  graphMoments: PricingCurvePoint[]
}

export const ANALYSIS_TOAST_ID = 'question-plan-analysis'
export const ANALYSIS_REQUEST_TIMEOUT_MS = 90000
export const VALUE_PRICING_REQUEST_TIMEOUT_MS = 90000
export const VALUE_PRICING_TOAST_ID = 'value-pricing-analysis'
export const INITIAL_STAGE_ID: QuestionPlanStageId = QUESTION_PLAN_STAGE_SEQUENCE[0]
export const STEP_SEQUENCE: Step[] = [1, 2, 3, 4, 5, 6, 7]
export const BUSINESS_IMPACT_OPTIONS: MatterProfileOption[] = [
  { label: 'Business as usual', score: 1 },
  { label: 'Reductive', score: 2 },
  { label: 'Protective', score: 2 },
  { label: 'Enabling', score: 3 },
  { label: 'Transformative', score: 4 }
]
export const FOOTPRINT_OPTIONS: MatterProfileOption[] = [
  { label: 'Single jurisdiction', score: 1 },
  { label: 'Multi-jurisdiction', score: 2 },
  { label: 'Cross border', score: 3 }
]
export const COMPLEXITY_OPTIONS: MatterProfileOption[] = [
  { label: 'Low', score: 1 },
  { label: 'Medium', score: 2 },
  { label: 'High', score: 3 }
]
export const URGENCY_OPTIONS: MatterProfileOption[] = [
  { label: 'Low priority', score: 0.5 },
  { label: 'Business as usual', score: 1 },
  { label: 'Urgent', score: 2 },
  { label: 'Emergency', score: 23 }
]
export const COUNTERPARTY_OPTIONS: MatterProfileOption[] = [
  { label: 'Unsophisticated', score: 1 },
  { label: 'Competent', score: 2 },
  { label: 'Government', score: 3 }
]
export const VISIBILITY_OPTIONS: MatterProfileOption[] = [
  { label: 'Routine', score: 1 },
  { label: 'Management', score: 2 },
  { label: 'Board', score: 3 },
  { label: 'Public', score: 4 }
]
export const DEFAULT_MATTER_PROFILE: MatterProfile = {
  businessImpactIndex: 0,
  footprintIndex: 0,
  complexityIndex: 1,
  urgencyIndex: 1,
  riskProfile: 5000000,
  counterpartyIndex: 1,
  visibilityIndex: 1
}
export const MATTER_PROFILE_SCORE_MAX = 40
export const RISK_PROFILE_MAX = 250000000
export const RISK_PROFILE_STEP = 250000
export const DIMENSION_META: Array<{
  key: ValueDimensionKey
  label: string
  description: string
  keywords: RegExp[]
  colorClass: string
}> = [
  {
    key: 'riskReduction',
    label: 'Risk Reduction',
    description: 'Litigation, regulatory, compliance, and downside exposure avoided.',
    keywords: [
      /\brisk\b/gi,
      /\bexposure\b/gi,
      /\bliabilit(y|ies)\b/gi,
      /\blitigation\b/gi,
      /\blawsuit\b/gi,
      /\bclaim(s)?\b/gi,
      /\bregulator(y|ies)\b/gi,
      /\bcompliance\b/gi,
      /\bfine(s)?\b/gi,
      /\bbreach(es)?\b/gi,
      /\bindemnif(y|ication)\b/gi
    ],
    colorClass: 'bg-red-500'
  },
  {
    key: 'transactionEnablement',
    label: 'Transaction Enablement',
    description: 'Revenue, launches, closings, and business outcomes unlocked.',
    keywords: [
      /\brevenue\b/gi,
      /\bgrowth\b/gi,
      /\bsale(s)?\b/gi,
      /\btransaction(s)?\b/gi,
      /\bacquisition(s)?\b/gi,
      /\bmerger(s)?\b/gi,
      /\bdeal(s)?\b/gi,
      /\blaunch\b/gi,
      /\bcustomer(s)?\b/gi,
      /\bmarket(s)?\b/gi,
      /\bcontract(s)?\b/gi
    ],
    colorClass: 'bg-emerald-500'
  },
  {
    key: 'speedAndCertainty',
    label: 'Speed & Certainty',
    description: 'Timing, deadline pressure, and predictability of the outcome.',
    keywords: [
      /\bdeadline(s)?\b/gi,
      /\burgent\b/gi,
      /\bquarter\b/gi,
      /\bimmediate(ly)?\b/gi,
      /\btiming\b/gi,
      /\bspeed\b/gi,
      /\bcertainty\b/gi,
      /\bpredictab(le|ility)\b/gi,
      /\bclose\b/gi,
      /\btimeline\b/gi,
      /\bwindow\b/gi
    ],
    colorClass: 'bg-sky-500'
  },
  {
    key: 'optionality',
    label: 'Optionality',
    description: 'Flexibility, strategic rights, IP position, and future leverage.',
    keywords: [
      /\boption(s)?\b/gi,
      /\boptionalit(y|ies)\b/gi,
      /\bflexib(le|ility)\b/gi,
      /\brenewal\b/gi,
      /\bexpansion\b/gi,
      /\bip\b/gi,
      /\bpatent(s)?\b/gi,
      /\blicen[sc]e(s|d)?\b/gi,
      /\bexclusive\b/gi,
      /\bright(s)?\b/gi,
      /\bportfolio\b/gi
    ],
    colorClass: 'bg-amber-500'
  }
]

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createRequestError(message: string, status?: number) {
  const error = new Error(message) as RequestError
  error.status = status
  return error
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'The analysis request timed out before the server finished streaming the result.'
  }

  return error instanceof Error ? error.message : 'Failed to generate review questions'
}

export function isRetriableRequestError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const status =
    'status' in error && typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : undefined

  if (status !== undefined) {
    return status === 408 || status === 425 || status === 429 || status >= 500
  }

  return error.name === 'AbortError' || /timeout|timed out|fetch failed|network|stream ended/i.test(error.message)
}

export function parseSseMessage(rawMessage: string): ParsedSseMessage | null {
  const lines = rawMessage
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)

  if (lines.length === 0 || lines[0].startsWith(':')) {
    return null
  }

  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    event,
    data: JSON.parse(dataLines.join('\n'))
  }
}

export function countWords(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return 0
  }

  return trimmed.split(/\s+/).length
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function roundCurrency(value: number, increment = 5000) {
  return Math.max(increment, Math.round(value / increment) * increment)
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

export function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: value >= 10000000 ? 1 : 0
  }).format(value)
}

export function formatScore(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

export function formatPercent(value: number) {
  return `${value.toFixed(value < 1 ? 2 : 1)}%`
}

export function createPreview(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`
}

export function formatFilingDate(value: string) {
  if (!value) {
    return 'Unknown filing date'
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value
  const parsed = new Date(normalized)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(parsed)
}

export function countKeywordMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((sum, pattern) => sum + (text.match(pattern)?.length ?? 0), 0)
}

export function getMatterProfileSelections(matterProfile: MatterProfile): MatterProfileSummaryItem[] {
  return [
    {
      label: 'Business Impact',
      selectedLabel: BUSINESS_IMPACT_OPTIONS[matterProfile.businessImpactIndex]?.label ?? BUSINESS_IMPACT_OPTIONS[0].label,
      score: BUSINESS_IMPACT_OPTIONS[matterProfile.businessImpactIndex]?.score ?? BUSINESS_IMPACT_OPTIONS[0].score
    },
    {
      label: 'Footprint',
      selectedLabel: FOOTPRINT_OPTIONS[matterProfile.footprintIndex]?.label ?? FOOTPRINT_OPTIONS[0].label,
      score: FOOTPRINT_OPTIONS[matterProfile.footprintIndex]?.score ?? FOOTPRINT_OPTIONS[0].score
    },
    {
      label: 'Complexity',
      selectedLabel: COMPLEXITY_OPTIONS[matterProfile.complexityIndex]?.label ?? COMPLEXITY_OPTIONS[0].label,
      score: COMPLEXITY_OPTIONS[matterProfile.complexityIndex]?.score ?? COMPLEXITY_OPTIONS[0].score
    },
    {
      label: 'Urgency',
      selectedLabel: URGENCY_OPTIONS[matterProfile.urgencyIndex]?.label ?? URGENCY_OPTIONS[0].label,
      score: URGENCY_OPTIONS[matterProfile.urgencyIndex]?.score ?? URGENCY_OPTIONS[0].score
    },
    {
      label: 'Counterparty',
      selectedLabel: COUNTERPARTY_OPTIONS[matterProfile.counterpartyIndex]?.label ?? COUNTERPARTY_OPTIONS[0].label,
      score: COUNTERPARTY_OPTIONS[matterProfile.counterpartyIndex]?.score ?? COUNTERPARTY_OPTIONS[0].score
    },
    {
      label: 'Visibility',
      selectedLabel: VISIBILITY_OPTIONS[matterProfile.visibilityIndex]?.label ?? VISIBILITY_OPTIONS[0].label,
      score: VISIBILITY_OPTIONS[matterProfile.visibilityIndex]?.score ?? VISIBILITY_OPTIONS[0].score
    }
  ]
}

export function getMatterProfileSignalLabel(score: number) {
  if (score >= 75) {
    return 'Critical matter signal'
  }

  if (score >= 55) {
    return 'Leadership-visible matter signal'
  }

  if (score >= 35) {
    return 'Elevated matter signal'
  }

  return 'Routine matter signal'
}

export function buildMatterProfileContext(matterProfile: MatterProfile) {
  const selections = getMatterProfileSelections(matterProfile)
  const matterProfileScore = clamp(
    Math.round((selections.reduce((sum, item) => sum + item.score, 0) / MATTER_PROFILE_SCORE_MAX) * 100),
    0,
    100
  )

  return [
    'Client matter calibration:',
    ...selections.map((item) => `- ${item.label}: ${item.selectedLabel} (score ${formatScore(item.score)})`),
    `- Risk Profile: ${formatCurrency(matterProfile.riskProfile)} prepared exposure`,
    `- Overall Matter Signal: ${matterProfileScore}/100 (${getMatterProfileSignalLabel(matterProfileScore)})`
  ].join('\n')
}

export function buildDefaultPricingGraphMoments(summary: Pick<
  PricingSummary,
  'priceFloor' | 'priceCeiling' | 'recommendedPrice' | 'dimensions'
>) {
  const spread = Math.max(summary.priceCeiling - summary.priceFloor, 1)
  const getDimensionScore = (key: ValueDimensionKey) =>
    summary.dimensions.find((dimension) => dimension.key === key)?.score ?? 50

  const graphTemplate = [
    {
      label: 'Baseline',
      normalized: 0.16
    },
    {
      label: 'Risk',
      normalized: 0.18 + getDimensionScore('riskReduction') / 100 * 0.52
    },
    {
      label: 'Commercial',
      normalized: 0.12 + getDimensionScore('transactionEnablement') / 100 * 0.66
    },
    {
      label: 'Timing',
      normalized: 0.14 + getDimensionScore('speedAndCertainty') / 100 * 0.58
    },
    {
      label: 'Strategic',
      normalized: 0.2 + getDimensionScore('optionality') / 100 * 0.52
    }
  ]

  const moments = graphTemplate.map((entry, index) => {
    const recommended = roundCurrency(summary.priceFloor + spread * clamp(entry.normalized, 0.08, 0.96))
    const volatility = 0.12 + Math.abs(entry.normalized - 0.5) * 0.35 + (index % 2 === 0 ? 0.03 : 0.07)
    const localSpread = Math.max(spread * volatility, 5000)

    return {
      label: entry.label,
      floor: roundCurrency(clamp(recommended - localSpread / 2, summary.priceFloor * 0.7, summary.priceCeiling)),
      recommended,
      ceiling: roundCurrency(clamp(recommended + localSpread / 2, summary.priceFloor, summary.priceCeiling * 1.15))
    }
  })

  return [
    ...moments,
    {
      label: 'Recommended',
      floor: summary.priceFloor,
      recommended: summary.recommendedPrice,
      ceiling: summary.priceCeiling
    }
  ]
}

export function buildPricingSummary(analysis: AnalysisResult, answers: string[], matterProfile: MatterProfile): PricingSummary {
  const snapshots = analysis.questions.map((question, index) => {
    const answer = answers[index]?.trim() ?? ''
    const words = countWords(answer)

    return {
      businessUnit: question.businessUnit || 'General',
      question: question.question,
      answer,
      words
    }
  })

  const totalQuestions = snapshots.length
  const answeredQuestions = snapshots.filter((snapshot) => snapshot.answer).length
  const totalWords = snapshots.reduce((sum, snapshot) => sum + snapshot.words, 0)
  const averageWords = answeredQuestions > 0 ? Math.round(totalWords / answeredQuestions) : 0
  const completionPercent = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0

  const combinedText = snapshots.map((snapshot) => snapshot.answer.toLowerCase()).join('\n')

  const dimensionBaseScores = DIMENSION_META.map((dimension) => {
    const keywordHits = countKeywordMatches(combinedText, dimension.keywords)
    const score = clamp(
      Math.round(answeredQuestions * 8 + averageWords / 6 + keywordHits * 7),
      12,
      100
    )

    return {
      ...dimension,
      score
    }
  })

  const totalDimensionScore = dimensionBaseScores.reduce((sum, dimension) => sum + dimension.score, 0)
  const answerDepthScore = clamp(Math.round(totalWords / 16), 0, 100)
  const baseDocumentComplexityScore = clamp(
    Math.round(answerDepthScore * 0.55 + completionPercent * 0.25 + totalDimensionScore / 8),
    20,
    96
  )

  const matterProfileSelections = getMatterProfileSelections(matterProfile)
  const matterProfileRawScore = matterProfileSelections.reduce((sum, item) => sum + item.score, 0)
  const matterProfileScore = clamp(
    Math.round((matterProfileRawScore / MATTER_PROFILE_SCORE_MAX) * 100),
    0,
    100
  )
  const matterProfileSignalLabel = getMatterProfileSignalLabel(matterProfileScore)
  const matterProfileAdjustment = Number((1 + matterProfileScore / 180).toFixed(2))

  const clientComplexitySignal = clamp(
    Math.round(
      (matterProfileSelections[2]?.score ?? 1) / 3 * 34 +
      (matterProfileSelections[1]?.score ?? 1) / 3 * 18 +
      (matterProfileSelections[5]?.score ?? 1) / 4 * 16 +
      (matterProfileSelections[4]?.score ?? 1) / 3 * 12 +
      (matterProfileSelections[0]?.score ?? 1) / 4 * 10 +
      (matterProfileSelections[3]?.score ?? 0.5) / 23 * 10
    ),
    0,
    100
  )

  const documentComplexityScore = clamp(
    Math.round(baseDocumentComplexityScore * 0.72 + clientComplexitySignal * 0.28),
    20,
    98
  )

  const baseValueAtStake = roundCurrency(
    totalDimensionScore * 90000 + totalWords * 2400 + answeredQuestions * 650000,
    25000
  )
  const riskAnchoredValue = Math.max(baseValueAtStake, matterProfile.riskProfile)
  const valueAtStake = roundCurrency(riskAnchoredValue * matterProfileAdjustment, 25000)

  const exposurePercent = clamp(
    0.45 + documentComplexityScore / 12 + matterProfileScore / 55,
    0.6,
    9.5
  )

  let feeBandLowPercent = 0.8
  let feeBandHighPercent = 2

  if (valueAtStake >= 250000000) {
    feeBandLowPercent = 0.05
    feeBandHighPercent = 0.25
  } else if (valueAtStake >= 50000000) {
    feeBandLowPercent = 0.12
    feeBandHighPercent = 0.6
  } else if (valueAtStake >= 10000000) {
    feeBandLowPercent = 0.35
    feeBandHighPercent = 1.1
  }

  const recommendedFeePercent = Number(
    (feeBandLowPercent + (feeBandHighPercent - feeBandLowPercent) * (documentComplexityScore / 100)).toFixed(2)
  )

  const priceFloor = roundCurrency((valueAtStake * feeBandLowPercent) / 100)
  const priceCeiling = roundCurrency((valueAtStake * feeBandHighPercent) / 100)
  const recommendedPrice = roundCurrency((valueAtStake * recommendedFeePercent) / 100)

  const dimensions = dimensionBaseScores.map((dimension) => ({
    key: dimension.key,
    label: dimension.label,
    description: dimension.description,
    score: dimension.score,
    amount: roundCurrency((valueAtStake * dimension.score) / totalDimensionScore, 5000),
    colorClass: dimension.colorClass
  }))

  const biggestDriver =
    [...dimensions].sort((left, right) => right.amount - left.amount)[0]?.label ?? 'Risk Reduction'

  const unitMap = new Map<
    string,
    {
      questionCount: number
      answeredCount: number
      totalWords: number
    }
  >()

  analysis.businessUnits.forEach((unit) => {
    unitMap.set(unit, {
      questionCount: 0,
      answeredCount: 0,
      totalWords: 0
    })
  })

  snapshots.forEach((snapshot) => {
    const existing = unitMap.get(snapshot.businessUnit) ?? {
      questionCount: 0,
      answeredCount: 0,
      totalWords: 0
    }

    existing.questionCount += 1
    existing.totalWords += snapshot.words

    if (snapshot.answer) {
      existing.answeredCount += 1
    }

    unitMap.set(snapshot.businessUnit, existing)
  })

  const units = Array.from(unitMap.entries())
    .map(([businessUnit, summary]) => ({
      businessUnit,
      questionCount: summary.questionCount,
      answeredCount: summary.answeredCount,
      totalWords: summary.totalWords,
      sharePercent: totalWords > 0 ? (summary.totalWords / totalWords) * 100 : 0
    }))
    .sort((left, right) => right.totalWords - left.totalWords)

  const highlights = snapshots
    .filter((snapshot) => snapshot.answer)
    .sort((left, right) => right.words - left.words)
    .slice(0, 3)
    .map((snapshot) => ({
      businessUnit: snapshot.businessUnit,
      question: snapshot.question,
      preview: createPreview(snapshot.answer),
      words: snapshot.words
    }))

  let marketSignalLabel = 'Low-value preview'

  if (valueAtStake >= 50000000) {
    marketSignalLabel = 'High-value strategic matter'
  } else if (valueAtStake >= 10000000) {
    marketSignalLabel = 'Material enterprise matter'
  } else if (valueAtStake >= 3000000) {
    marketSignalLabel = 'Mid-scale business matter'
  }

  const baseSummary: PricingSummary = {
    totalQuestions,
    answeredQuestions,
    totalWords,
    averageWords,
    completionPercent,
    marketSignalLabel,
    baseValueAtStake,
    valueAtStake,
    exposurePercent,
    feeBandLowPercent,
    feeBandHighPercent,
    recommendedFeePercent,
    priceFloor,
    priceCeiling,
    recommendedPrice,
    documentComplexityScore,
    biggestDriver,
    matterProfileScore,
    matterProfileAdjustment,
    matterProfileSignalLabel,
    riskProfile: matterProfile.riskProfile,
    dimensions,
    units,
    highlights,
    filingDateLabel: formatFilingDate(analysis.latestTenK.filingDate),
    executiveSummary: `${marketSignalLabel} with ${biggestDriver.toLowerCase()} acting as the strongest pricing lever in the completed review answers.`,
    pricingNarrative: 'The fee curve rises and dips across the value drivers before settling on the recommended band.',
    assumptions: [
      'The written answers accurately represent the uploaded document set.',
      'The stated prepared exposure is a valid downside anchor for the matter.',
      'Internal delivery economics and staffing constraints have not yet been layered into the recommendation.'
    ],
    graphMoments: []
  }

  return {
    ...baseSummary,
    graphMoments: buildDefaultPricingGraphMoments(baseSummary)
  }
}
