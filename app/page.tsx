"use client"

import React, { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis
} from 'recharts'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import {
  type AnalysisResult,
  type QuestionPlanCompletePayload,
  type QuestionPlanErrorPayload,
  type QuestionPlanProgressPayload,
  QUESTION_PLAN_MAX_ATTEMPTS,
  QUESTION_PLAN_STAGE_DETAILS,
  QUESTION_PLAN_STAGE_SEQUENCE,
  type QuestionPlanStageId
} from '@/lib/question-plan'

type Company = {
  ticker: string
  title: string
}

type RequestError = Error & {
  status?: number
}

type ParsedSseMessage = {
  event: string
  data: unknown
}

type ValuePricingResponsePayload = {
  result: PricingSummary
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7

type MatterProfileOption = {
  label: string
  score: number
}

type MatterProfile = {
  businessImpactIndex: number
  footprintIndex: number
  complexityIndex: number
  urgencyIndex: number
  riskProfile: number
  counterpartyIndex: number
  visibilityIndex: number
}

type MatterProfileSummaryItem = {
  label: string
  selectedLabel: string
  score: number
}

type ValueDimensionKey =
  | 'riskReduction'
  | 'transactionEnablement'
  | 'speedAndCertainty'
  | 'optionality'

type ValueDimensionScore = {
  key: ValueDimensionKey
  label: string
  description: string
  score: number
  amount: number
  colorClass: string
}

type UnitSummary = {
  businessUnit: string
  questionCount: number
  answeredCount: number
  totalWords: number
  sharePercent: number
}

type PricingCurvePoint = {
  label: string
  floor: number
  recommended: number
  ceiling: number
}

type PricingSummary = {
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

const ANALYSIS_TOAST_ID = 'question-plan-analysis'
const ANALYSIS_REQUEST_TIMEOUT_MS = 90000
const VALUE_PRICING_REQUEST_TIMEOUT_MS = 90000
const VALUE_PRICING_TOAST_ID = 'value-pricing-analysis'
const INITIAL_STAGE_ID: QuestionPlanStageId = QUESTION_PLAN_STAGE_SEQUENCE[0]
const STEP_SEQUENCE: Step[] = [1, 2, 3, 4, 5, 6, 7]
const BUSINESS_IMPACT_OPTIONS: MatterProfileOption[] = [
  { label: 'Business as usual', score: 1 },
  { label: 'Reductive', score: 2 },
  { label: 'Protective', score: 2 },
  { label: 'Enabling', score: 3 },
  { label: 'Transformative', score: 4 }
]
const FOOTPRINT_OPTIONS: MatterProfileOption[] = [
  { label: 'Single jurisdiction', score: 1 },
  { label: 'Multi-jurisdiction', score: 2 },
  { label: 'Cross border', score: 3 }
]
const COMPLEXITY_OPTIONS: MatterProfileOption[] = [
  { label: 'Low', score: 1 },
  { label: 'Medium', score: 2 },
  { label: 'High', score: 3 }
]
const URGENCY_OPTIONS: MatterProfileOption[] = [
  { label: 'Low priority', score: 0.5 },
  { label: 'Business as usual', score: 1 },
  { label: 'Urgent', score: 2 },
  { label: 'Emergency', score: 23 }
]
const COUNTERPARTY_OPTIONS: MatterProfileOption[] = [
  { label: 'Unsophisticated', score: 1 },
  { label: 'Competent', score: 2 },
  { label: 'Government', score: 3 }
]
const VISIBILITY_OPTIONS: MatterProfileOption[] = [
  { label: 'Routine', score: 1 },
  { label: 'Management', score: 2 },
  { label: 'Board', score: 3 },
  { label: 'Public', score: 4 }
]
const DEFAULT_MATTER_PROFILE: MatterProfile = {
  businessImpactIndex: 0,
  footprintIndex: 0,
  complexityIndex: 1,
  urgencyIndex: 1,
  riskProfile: 5000000,
  counterpartyIndex: 1,
  visibilityIndex: 1
}
const MATTER_PROFILE_SCORE_MAX = 40
const RISK_PROFILE_MAX = 250000000
const RISK_PROFILE_STEP = 250000
const DIMENSION_META: Array<{
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createRequestError(message: string, status?: number) {
  const error = new Error(message) as RequestError
  error.status = status
  return error
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'The analysis request timed out before the server finished streaming the result.'
  }

  return error instanceof Error ? error.message : 'Failed to generate review questions'
}

function isRetriableRequestError(error: unknown) {
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

function parseSseMessage(rawMessage: string): ParsedSseMessage | null {
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

function countWords(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return 0
  }

  return trimmed.split(/\s+/).length
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundCurrency(value: number, increment = 5000) {
  return Math.max(increment, Math.round(value / increment) * increment)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: value >= 10000000 ? 1 : 0
  }).format(value)
}

function formatScore(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)
}

function formatPercent(value: number) {
  return `${value.toFixed(value < 1 ? 2 : 1)}%`
}

function createPreview(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, ' ').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`
}

function formatFilingDate(value: string) {
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

function countKeywordMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((sum, pattern) => sum + (text.match(pattern)?.length ?? 0), 0)
}

function getMatterProfileSelections(matterProfile: MatterProfile): MatterProfileSummaryItem[] {
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

function getMatterProfileSignalLabel(score: number) {
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

function buildMatterProfileContext(matterProfile: MatterProfile) {
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

function buildDefaultPricingGraphMoments(summary: Pick<
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

function buildPricingSummary(analysis: AnalysisResult, answers: string[], matterProfile: MatterProfile): PricingSummary {
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

export default function Home() {
  const [step, setStep] = useState<Step>(1)
  const [query, setQuery] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [filtered, setFiltered] = useState<Company[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisAttempt, setAnalysisAttempt] = useState(0)
  const [pricingSummary, setPricingSummary] = useState<PricingSummary | null>(null)
  const [pricingError, setPricingError] = useState('')
  const [isGeneratingPricing, setIsGeneratingPricing] = useState(false)
  const [matterProfile, setMatterProfile] = useState<MatterProfile>(DEFAULT_MATTER_PROFILE)
  const [analysisProgress, setAnalysisProgress] = useState<QuestionPlanProgressPayload>({
    stageId: INITIAL_STAGE_ID,
    ...QUESTION_PLAN_STAGE_DETAILS[INITIAL_STAGE_ID]
  })

  const analysisStageIndex = Math.max(QUESTION_PLAN_STAGE_SEQUENCE.indexOf(analysisProgress.stageId), 0)
  const analysisProgressPercent = ((analysisStageIndex + 1) / QUESTION_PLAN_STAGE_SEQUENCE.length) * 100
  const isGeneratingQuestions = analysisProgress.stageId === 'generating-questions'
  const completedStageIds = QUESTION_PLAN_STAGE_SEQUENCE.slice(0, analysisStageIndex)
  const questions = analysis?.questions ?? []
  const currentQuestion = questions[currentQuestionIndex]
  const currentAnswer = answers[currentQuestionIndex] ?? ''
  const completedQuestionCount = questions.filter((_, index) => Boolean(answers[index]?.trim())).length
  const matterProfileSelections = getMatterProfileSelections(matterProfile)
  const matterProfileScore = clamp(
    Math.round((matterProfileSelections.reduce((sum, item) => sum + item.score, 0) / MATTER_PROFILE_SCORE_MAX) * 100),
    0,
    100
  )
  const matterProfileSignalLabel = getMatterProfileSignalLabel(matterProfileScore)
  const pricingScaffold = analysis ? buildPricingSummary(analysis, answers, matterProfile) : null

  const resetPricing = () => {
    setPricingSummary(null)
    setPricingError('')
    setIsGeneratingPricing(false)
  }

  const resetAnalysis = ({ resetMatterProfile = false }: { resetMatterProfile?: boolean } = {}) => {
    setAnalysis(null)
    setAnalysisError('')
    setCurrentQuestionIndex(0)
    setAnswers([])
    setAnalysisAttempt(0)
    resetPricing()
    if (resetMatterProfile) {
      setMatterProfile(DEFAULT_MATTER_PROFILE)
    }
    setAnalysisProgress({
      stageId: INITIAL_STAGE_ID,
      ...QUESTION_PLAN_STAGE_DETAILS[INITIAL_STAGE_ID]
    })
  }

  const buildAnalysisFormData = () => {
    const formData = new FormData()
    formData.append('companyName', query.trim())

    if (selectedCompany?.ticker) {
      formData.append('companyTicker', selectedCompany.ticker)
    }

    formData.append('matterProfileContext', buildMatterProfileContext(matterProfile))

    uploadedFiles.forEach((file) => {
      formData.append('documents', file)
    })

    return formData
  }

  const buildPricingFormData = () => {
    if (!analysis) {
      return null
    }

    const formData = new FormData()
    formData.append('analysis', JSON.stringify(analysis))
    formData.append('answers', JSON.stringify(answers))
    formData.append('matterProfile', JSON.stringify(matterProfile))
    formData.append('matterProfileContext', buildMatterProfileContext(matterProfile))

    uploadedFiles.forEach((file) => {
      formData.append('documents', file)
    })

    return formData
  }

  const updateAnalysisToast = (progress: QuestionPlanProgressPayload, attempt: number) => {
    const attemptLabel = attempt > 1 ? ` Attempt ${attempt} of ${QUESTION_PLAN_MAX_ATTEMPTS}.` : ''

    toast.loading(progress.title, {
      id: ANALYSIS_TOAST_ID,
      description: `${progress.description}${attemptLabel}`.trim(),
      duration: Infinity
    })
  }

  const requestQuestionPlanStream = async (attempt: number) => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), ANALYSIS_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch('/api/question-plan', {
        method: 'POST',
        body: buildAnalysisFormData(),
        signal: controller.signal
      })

      if (!response.ok) {
        let message = 'Failed to generate review questions'

        try {
          const payload = (await response.json()) as { error?: string }
          message = payload.error ?? message
        } catch {
          try {
            message = await response.text()
          } catch {
            message = 'Failed to generate review questions'
          }
        }

        throw createRequestError(message, response.status)
      }

      if (!response.body) {
        throw createRequestError('The analysis stream did not return a readable response body.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '')

        let boundaryIndex = buffer.indexOf('\n\n')

        while (boundaryIndex !== -1) {
          const rawMessage = buffer.slice(0, boundaryIndex)
          buffer = buffer.slice(boundaryIndex + 2)

          const parsed = parseSseMessage(rawMessage)

          if (parsed) {
            if (parsed.event === 'progress') {
              const progress = parsed.data as QuestionPlanProgressPayload
              setAnalysisProgress(progress)
              updateAnalysisToast(progress, attempt)
            }

            if (parsed.event === 'complete') {
              const payload = parsed.data as QuestionPlanCompletePayload
              return payload.result
            }

            if (parsed.event === 'error') {
              const payload = parsed.data as QuestionPlanErrorPayload
              throw createRequestError(payload.message, 500)
            }
          }

          boundaryIndex = buffer.indexOf('\n\n')
        }
      }

      throw createRequestError('The analysis stream ended before returning review questions.')
    } finally {
      clearTimeout(timeout)
    }
  }

  const requestValuePricing = async () => {
    const formData = buildPricingFormData()

    if (!formData) {
      throw createRequestError('The pricing request could not be prepared because the analysis is missing.')
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), VALUE_PRICING_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch('/api/value-pricing', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      })

      if (!response.ok) {
        let message = 'Failed to generate value pricing output'

        try {
          const payload = (await response.json()) as { error?: string }
          message = payload.error ?? message
        } catch {
          try {
            message = await response.text()
          } catch {
            message = 'Failed to generate value pricing output'
          }
        }

        throw createRequestError(message, response.status)
      }

      const payload = (await response.json()) as ValuePricingResponsePayload

      if (!payload?.result) {
        throw createRequestError('The pricing request did not return a usable result.')
      }

      return payload.result
    } finally {
      clearTimeout(timeout)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files)
      resetAnalysis({ resetMatterProfile: true })
      setUploadedFiles((prev) => [...prev, ...newFiles])
      event.target.value = ''
    }
  }

  const removeFile = (index: number) => {
    resetAnalysis({ resetMatterProfile: true })
    setUploadedFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  useEffect(() => {
    async function fetchCompanies() {
      try {
        const res = await fetch('/api/tickers')
        const data = (await res.json()) as Record<string, Company>
        const list = Object.values(data).map((company) => ({
          ticker: company.ticker,
          title: company.title
        }))
        setCompanies(list)
      } catch (error) {
        console.error('Failed to fetch tickers', error)
      }
    }

    fetchCompanies()
  }, [])

  useEffect(() => {
    if (query.length < 2) {
      setFiltered([])
      return
    }

    const results = companies
      .filter(
        (company) =>
          company.title.toLowerCase().includes(query.toLowerCase()) ||
          company.ticker.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 6)

    setFiltered(results)
  }, [query, companies])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current) {
        return
      }

      if (event.target instanceof Node && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  useEffect(() => {
    return () => {
      toast.dismiss(ANALYSIS_TOAST_ID)
      toast.dismiss(VALUE_PRICING_TOAST_ID)
    }
  }, [])

  const handleAnalyze = async () => {
    if (!query.trim() || uploadedFiles.length === 0 || isAnalyzing) {
      return
    }

    resetAnalysis()
    setIsOpen(false)
    setIsAnalyzing(true)
    setStep(4)

    try {
      for (let attempt = 1; attempt <= QUESTION_PLAN_MAX_ATTEMPTS; attempt += 1) {
        setAnalysisAttempt(attempt)
        const initialProgress: QuestionPlanProgressPayload = {
          stageId: INITIAL_STAGE_ID,
          ...QUESTION_PLAN_STAGE_DETAILS[INITIAL_STAGE_ID]
        }
        setAnalysisProgress(initialProgress)
        updateAnalysisToast(initialProgress, attempt)

        try {
          const payload = await requestQuestionPlanStream(attempt)
          setAnalysis(payload)
          setAnswers(Array.from({ length: payload.questions.length }, () => ''))
          setCurrentQuestionIndex(0)
          setStep(5)
          toast.success('Review questions ready', {
            id: ANALYSIS_TOAST_ID,
            description: `Generated ${payload.questions.length} tailored prompts for ${payload.company.name} using the matter inputs and uploaded materials.`
          })
          return
        } catch (error) {
          const canRetry = attempt < QUESTION_PLAN_MAX_ATTEMPTS && isRetriableRequestError(error)

          if (!canRetry) {
            throw error
          }

          toast.loading('Retrying analysis', {
            id: ANALYSIS_TOAST_ID,
            description: `Transient issue detected. Starting attempt ${attempt + 1} of ${QUESTION_PLAN_MAX_ATTEMPTS}.`,
            duration: Infinity
          })

          await sleep(900 * attempt)
        }
      }
    } catch (error) {
      const message = getErrorMessage(error)
      setAnalysisError(message)
      toast.error('Analysis failed', {
        id: ANALYSIS_TOAST_ID,
        description: message
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleGenerateValuePricing = async () => {
    if (!analysis || isGeneratingPricing) {
      return
    }

    resetPricing()
    setIsGeneratingPricing(true)
    setStep(6)

    toast.loading('Generating value pricing output', {
      id: VALUE_PRICING_TOAST_ID,
      description: 'Gemini is synthesizing the matter inputs, uploaded documents, and completed answers.',
      duration: Infinity
    })

    try {
      const result = await requestValuePricing()
      setPricingSummary(result)
      setStep(7)
      toast.success('Value pricing output ready', {
        id: VALUE_PRICING_TOAST_ID,
        description: `Generated a Gemini-backed pricing recommendation for ${analysis.company.name}.`
      })
    } catch (error) {
      const message = getErrorMessage(error)
      setPricingError(message)
      toast.error('Value pricing failed', {
        id: VALUE_PRICING_TOAST_ID,
        description: message
      })
    } finally {
      setIsGeneratingPricing(false)
    }
  }

  const updateCurrentAnswer = (value: string) => {
    resetPricing()
    setAnswers((prev) => {
      const next = [...prev]
      next[currentQuestionIndex] = value
      return next
    })
  }

  const handleNextQuestion = () => {
    if (!currentAnswer.trim()) {
      return
    }

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1)
      return
    }

    void handleGenerateValuePricing()
  }

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1)
      return
    }

    setStep(3)
  }

  const containerWidth =
    step === 7
      ? 'max-w-[960px]'
      : step === 6
        ? 'max-w-[780px]'
      : step === 5
        ? 'max-w-[620px]'
        : step === 3
          ? 'max-w-[780px]'
          : 'max-w-[440px]'

  return (
    <div className="min-h-screen bg-[#f4f4f5] flex items-center justify-center p-6 font-sans">
      <div className={`w-full ${containerWidth}`}>
        {/* <h2 className='text-center text-6xl mb-8 tracking-tighter font-light text-[#10b981]'>Valueprism</h2> */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-2">
            {STEP_SEQUENCE.map((item) => (
              <motion.div
                key={item}
                animate={{
                  width: step === item ? 32 : 12,
                  backgroundColor: step >= item ? '#10b981' : '#d4d4d8'
                }}
                className="h-1.5 rounded-full"
              />
            ))}
          </div>
        </div>

        <div className="relative min-h-[460px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <h1 className="text-[20px] font-semibold text-zinc-900 tracking-tight">Enter public company name</h1>
                <div className="relative" ref={containerRef}>
                  <Field
                    label="Company name"
                    value={query}
                    onChange={(value) => {
                      resetAnalysis({ resetMatterProfile: true })
                      setQuery(value)
                      setSelectedCompany(null)
                      setIsOpen(true)
                    }}
                    placeholder="e.g. Apple"
                  />
                  {isOpen && filtered.length > 0 && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden">
                      {filtered.map((company) => (
                        <button
                          key={company.ticker}
                          className="flex flex-col w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-100 last:border-none"
                          onClick={() => {
                            resetAnalysis({ resetMatterProfile: true })
                            setQuery(company.title)
                            setSelectedCompany(company)
                            setIsOpen(false)
                          }}
                        >
                          <span className="text-[14px] font-medium text-zinc-900">{company.title}</span>
                          <span className="text-[12px] text-zinc-500">{company.ticker}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (!query.trim()) {
                      return
                    }

                    resetAnalysis({ resetMatterProfile: true })
                    setStep(2)
                  }}
                  className="h-12 w-full rounded-2xl border border-zinc-300 bg-white text-[15px] font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
                >
                  Next
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-6"
              >
                <h1 className="text-[20px] font-semibold text-zinc-900 tracking-tight">Upload relevant documents</h1>

                <label className="relative flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-zinc-300 rounded-3xl bg-zinc-50 cursor-pointer hover:border-emerald-500/50 transition-colors">
                  <input type="file" multiple className="hidden" onChange={handleFileChange} />
                  <span className="text-[14px] font-medium text-zinc-900">Drop files here</span>
                  <span className="text-[12px] text-zinc-500 mt-1">or click to browse</span>
                </label>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider">Uploaded Files</p>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                      {uploadedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl"
                        >
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-[13px] font-medium text-zinc-900 truncate">{file.name}</span>
                            <span className="text-[11px] text-zinc-500">{(file.size / 1024).toFixed(1)} KB</span>
                          </div>
                          <button onClick={() => removeFile(idx)} className="text-zinc-400 hover:text-red-500 p-1">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white font-medium text-zinc-900"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (uploadedFiles.length === 0) {
                        return
                      }

                      setStep(3)
                    }}
                    disabled={uploadedFiles.length === 0}
                    className="h-12 flex-[2] rounded-2xl bg-emerald-600 text-white font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && analysis && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                    <div className="max-w-[520px]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        Matter Inputs
                      </p>
                      <h1 className="mt-3 text-[24px] font-semibold tracking-tight text-zinc-900">
                        Calibrate the matter before Gemini runs
                      </h1>
                      <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">
                        These inputs are sent with the filing and uploaded materials so Gemini can tailor the question set to the client&apos;s business context.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        Matter Signal
                      </p>
                      <p className="mt-1 text-[24px] font-semibold text-zinc-900">{matterProfileScore}/100</p>
                      <p className="text-[12px] text-zinc-500">{matterProfileSignalLabel}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <MatterSliderCard
                    title="Business Impact"
                    options={BUSINESS_IMPACT_OPTIONS}
                    value={matterProfile.businessImpactIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, businessImpactIndex: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Footprint"
                    options={FOOTPRINT_OPTIONS}
                    value={matterProfile.footprintIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, footprintIndex: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Complexity"
                    options={COMPLEXITY_OPTIONS}
                    value={matterProfile.complexityIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, complexityIndex: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Urgency"
                    options={URGENCY_OPTIONS}
                    value={matterProfile.urgencyIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, urgencyIndex: value }))
                    }
                  />
                  <RiskProfileCard
                    className="md:col-span-2"
                    value={matterProfile.riskProfile}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, riskProfile: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Counterparty"
                    options={COUNTERPARTY_OPTIONS}
                    value={matterProfile.counterpartyIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, counterpartyIndex: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Visibility"
                    options={VISIBILITY_OPTIONS}
                    value={matterProfile.visibilityIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, visibilityIndex: value }))
                    }
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white font-medium text-zinc-900"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={uploadedFiles.length === 0 || isAnalyzing}
                    className="h-12 flex-[2] rounded-2xl bg-zinc-900 text-white font-medium shadow-sm hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {analysis ? 'Regenerate Questions' : 'Generate Questions'}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && !analysis && (
              <motion.div
                key="step3-empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <MatterSliderCard
                    title="Business Impact"
                    options={BUSINESS_IMPACT_OPTIONS}
                    value={matterProfile.businessImpactIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, businessImpactIndex: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Footprint"
                    options={FOOTPRINT_OPTIONS}
                    value={matterProfile.footprintIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, footprintIndex: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Complexity"
                    options={COMPLEXITY_OPTIONS}
                    value={matterProfile.complexityIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, complexityIndex: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Urgency"
                    options={URGENCY_OPTIONS}
                    value={matterProfile.urgencyIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, urgencyIndex: value }))
                    }
                  />
                  <RiskProfileCard
                    className="md:col-span-2"
                    value={matterProfile.riskProfile}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, riskProfile: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Counterparty"
                    options={COUNTERPARTY_OPTIONS}
                    value={matterProfile.counterpartyIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, counterpartyIndex: value }))
                    }
                  />
                  <MatterSliderCard
                    title="Visibility"
                    options={VISIBILITY_OPTIONS}
                    value={matterProfile.visibilityIndex}
                    onValueChange={(value) =>
                      setMatterProfile((prev) => ({ ...prev, visibilityIndex: value }))
                    }
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white font-medium text-zinc-900"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={uploadedFiles.length === 0 || isAnalyzing}
                    className="h-12 flex-[2] rounded-2xl bg-zinc-900 text-white font-medium shadow-sm hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {analysis ? 'Regenerate Questions' : 'Generate Questions'}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-6 text-center space-y-6"
              >
                {isAnalyzing ? (
                  <div className="w-full rounded-[28px] border border-zinc-200 bg-white p-6 shadow-sm space-y-5 text-left">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        {analysisAttempt > 1 && (
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            Attempt {analysisAttempt} of {QUESTION_PLAN_MAX_ATTEMPTS}
                          </p>
                        )}
                        <h2 className="text-[22px] font-semibold text-zinc-900 leading-tight">
                          {analysisProgress.title}
                        </h2>
                        <p className="text-[14px] text-zinc-600 leading-relaxed">
                          {analysisProgress.description}
                        </p>
                      </div>
                      <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                        <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                        <span>Pipeline Activity</span>
                        <span>{Math.round(analysisProgressPercent)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                        <motion.div
                          animate={{ width: `${analysisProgressPercent}%` }}
                          className="h-full rounded-full bg-emerald-500"
                        />
                      </div>
                    </div>

                    {isGeneratingQuestions ? (
                      <div className="space-y-4">
                        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[18px] font-semibold text-emerald-950">
                                {QUESTION_PLAN_STAGE_DETAILS['generating-questions'].title}
                              </p>
                            </div>
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-emerald-700">
                              <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                            </div>
                          </div>
                          <p className="text-[14px] leading-relaxed text-emerald-900">
                            {analysisProgress.description}
                          </p>
                          <p className="text-[12px] leading-relaxed text-emerald-800/80">
                            Earlier SEC and document-prep stages are complete. The UI is now focused on Gemini until it returns the structured question set.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                            Completed So Far
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {completedStageIds.map((stageId) => (
                              <span
                                key={stageId}
                                className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-600"
                              >
                                {QUESTION_PLAN_STAGE_DETAILS[stageId].title}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">
                            Next
                          </p>
                          <p className="mt-1 text-[13px] font-medium text-zinc-800">
                            {QUESTION_PLAN_STAGE_DETAILS['finalizing-response'].title}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {QUESTION_PLAN_STAGE_SEQUENCE.map((stageId, index) => {
                          const details = QUESTION_PLAN_STAGE_DETAILS[stageId]
                          const state =
                            index < analysisStageIndex ? 'complete' : index === analysisStageIndex ? 'active' : 'pending'
                          const description =
                            stageId === analysisProgress.stageId ? analysisProgress.description : details.description

                          return (
                            <div
                              key={stageId}
                              className={`flex items-center gap-3 rounded-2xl px-3 py-2 transition-colors ${
                                state === 'active'
                                  ? 'bg-emerald-50 text-emerald-900'
                                  : state === 'complete'
                                    ? 'bg-zinc-50 text-zinc-700'
                                    : 'text-zinc-400'
                              }`}
                            >
                              <div
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                                  state === 'active'
                                    ? 'border-emerald-200 bg-white text-emerald-700'
                                    : state === 'complete'
                                      ? 'border-zinc-200 bg-white text-zinc-700'
                                      : 'border-zinc-200 bg-zinc-100 text-zinc-400'
                                }`}
                              >
                                {state === 'complete' ? '✓' : index + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-medium">{details.title}</p>
                                <p className="text-[12px] leading-relaxed opacity-80">{description}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </svg>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-[18px] font-medium text-zinc-900">Analysis could not be completed</h2>
                      <p className="text-[14px] text-zinc-600 max-w-[320px] leading-relaxed">
                        {analysisError || 'The question planner did not return a usable result.'}
                      </p>
                      {analysisAttempt > 0 && (
                        <p className="text-[12px] uppercase tracking-[0.18em] text-zinc-400">
                          Stopped after {analysisAttempt} {analysisAttempt === 1 ? 'attempt' : 'attempts'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(3)}
                        className="h-11 px-5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-[14px] font-medium"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleAnalyze}
                        className="h-11 px-5 rounded-xl bg-zinc-900 text-white text-[14px] font-medium"
                      >
                        Try Again
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {step === 5 && currentQuestion && analysis && (
              <motion.div
                key="step5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {analysis.businessUnits.map((businessUnit) => (
                      <span
                        key={businessUnit}
                        className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-700"
                      >
                        {businessUnit}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-[12px] text-zinc-500 leading-relaxed">
                        Question plan generated from {analysis.company.name}&apos;s {pricingScaffold?.filingDateLabel} 10-K.{' '}
                        <a
                          href={analysis.latestTenK.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                        >
                          View filing
                        </a>
                      </p>
                      <p className="text-[12px] text-zinc-500">
                        {matterProfileSignalLabel} · risk anchor {formatCurrency(matterProfile.riskProfile)}
                      </p>
                    </div>
                    <span className="text-[12px] text-zinc-400 font-medium">
                      {completedQuestionCount} / {questions.length}
                    </span>
                  </div>
                </div>

                <div className="bg-emerald-50 text-emerald-900 p-4 rounded-2xl rounded-bl-none border border-emerald-100 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {currentQuestion.businessUnit}
                  </p>
                  <p className="text-[14px] leading-relaxed font-medium">{currentQuestion.question}</p>
                </div>

                <div className="relative">
                  <textarea
                    className="w-full min-h-[150px] p-4 bg-white border border-zinc-200 rounded-2xl text-[14px] focus:ring-2 ring-emerald-500/20 focus:outline-none resize-none shadow-sm"
                    placeholder="Type your answer here..."
                    value={currentAnswer}
                    onChange={(event) => updateCurrentAnswer(event.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {questions.map((question, index) => {
                    const isActive = index === currentQuestionIndex
                    const isAnswered = Boolean(answers[index]?.trim())

                    return (
                      <button
                        key={`${question.businessUnit}-${index}`}
                        onClick={() => setCurrentQuestionIndex(index)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-colors ${
                          isActive
                            ? 'border-zinc-900 bg-zinc-900 text-white'
                            : isAnswered
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
                        }`}
                      >
                        Q{index + 1}
                      </button>
                    )
                  })}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <button
                    onClick={handlePreviousQuestion}
                    className="h-11 px-4 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-[14px] font-medium disabled:opacity-50"
                  >
                    {currentQuestionIndex === 0 ? 'Matter Inputs' : 'Previous'}
                  </button>
                  <p className="text-[12px] text-zinc-400 font-medium uppercase tracking-wider">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </p>
                  <button
                    disabled={!currentAnswer.trim()}
                    onClick={handleNextQuestion}
                    className="h-11 px-6 rounded-xl bg-zinc-900 text-white text-[14px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
                  >
                    {currentQuestionIndex === questions.length - 1 ? 'Generate Gemini Pricing Output' : 'Next Question'}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 6 && analysis && (
              <motion.div
                key="step6"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-4"
              >
                {isGeneratingPricing ? (
                  <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-zinc-200 flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Post-Question Gemini Pass
                        </p>
                        <h2 className="text-[22px] font-semibold text-zinc-900 leading-tight">
                          Building the value pricing output
                        </h2>
                        <p className="text-[14px] text-zinc-600 leading-relaxed max-w-[560px]">
                          Gemini is processing the completed answers, the uploaded materials, and the matter inputs into a structured pricing recommendation and a value-driven chart path.
                        </p>
                      </div>
                      <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                        <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                      </div>
                    </div>

                    <div className="grid gap-4 border-b border-zinc-200 p-5 md:grid-cols-3">
                      <MetricCard
                        label="Completed Answers"
                        value={`${completedQuestionCount}/${questions.length}`}
                        detail="Structured reviewer responses ready"
                      />
                      <MetricCard
                        label="Uploaded Documents"
                        value={`${uploadedFiles.length}`}
                        detail="Sent back through the Gemini pricing pass"
                      />
                      <MetricCard
                        label="Baseline Signal"
                        value={pricingScaffold?.marketSignalLabel ?? 'Preparing'}
                        detail={pricingScaffold ? formatCurrency(pricingScaffold.recommendedPrice) : 'Pricing scaffold is forming'}
                      />
                    </div>

                    <div className="p-5 space-y-3">
                      {[
                        'Questionnaire complete and packaged for pricing.',
                        'Matter inputs and uploaded documents attached as Gemini context.',
                        'Gemini is producing the final value pricing output and chart moments.'
                      ].map((item, index) => (
                        <div key={item} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                          <div
                            className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                              index < 2 ? 'border-emerald-200 bg-white text-emerald-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {index < 2 ? '✓' : '…'}
                          </div>
                          <p className="text-[13px] text-zinc-700">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center space-y-6">
                    <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-500">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      </svg>
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-[18px] font-medium text-zinc-900">Value pricing could not be completed</h2>
                      <p className="text-[14px] text-zinc-600 max-w-[420px] leading-relaxed">
                        {pricingError || 'The Gemini pricing pass did not return a usable result.'}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(5)}
                        className="h-11 px-5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-[14px] font-medium"
                      >
                        Back to Questions
                      </button>
                      <button
                        onClick={() => void handleGenerateValuePricing()}
                        className="h-11 px-5 rounded-xl bg-zinc-900 text-white text-[14px] font-medium"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {step === 7 && analysis && pricingSummary && (
              <motion.div
                key="step7"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-4"
              >
                <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-5 border-b border-zinc-200 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-[18px] font-semibold text-zinc-900">
                        {analysis.company.name} Value Pricing Output
                      </h2>
                      <p className="text-[13px] text-zinc-500 mt-1">
                        Gemini synthesized this output from the uploaded materials, the intake sliders, and the completed question set.
                      </p>
                    </div>
                    <button
                      onClick={() => setStep(5)}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                  </div>

                  <div className="border-b border-zinc-200 p-6 md:p-8">
                    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-center">
                      <div className="text-center xl:text-left">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                          Recommended Price
                        </p>
                        <div className="mt-3 text-[48px] font-semibold tracking-tight text-emerald-600">
                          {formatCurrency(pricingSummary.recommendedPrice)}
                        </div>
                        <p className="mt-2 text-[14px] text-zinc-600">
                          Range {formatCurrency(pricingSummary.priceFloor)} to {formatCurrency(pricingSummary.priceCeiling)}
                        </p>
                        <p className="mt-3 text-[12px] text-zinc-500">
                          {pricingSummary.marketSignalLabel} · fee curve point {formatPercent(pricingSummary.recommendedFeePercent)}
                        </p>
                        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-left">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            Gemini Summary
                          </p>
                          <p className="mt-2 text-[13px] leading-relaxed text-emerald-950">
                            {pricingSummary.executiveSummary}
                          </p>
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                          <MetricCard
                            label="Floor"
                            value={formatCurrency(pricingSummary.priceFloor)}
                            detail={formatPercent(pricingSummary.feeBandLowPercent)}
                          />
                          <MetricCard
                            label="Point"
                            value={formatCurrency(pricingSummary.recommendedPrice)}
                            detail={formatPercent(pricingSummary.recommendedFeePercent)}
                          />
                          <MetricCard
                            label="Ceiling"
                            value={formatCurrency(pricingSummary.priceCeiling)}
                            detail={formatPercent(pricingSummary.feeBandHighPercent)}
                          />
                        </div>
                      </div>

                      <PricingBandGraph
                        floor={pricingSummary.priceFloor}
                        recommended={pricingSummary.recommendedPrice}
                        ceiling={pricingSummary.priceCeiling}
                        graphMoments={pricingSummary.graphMoments}
                        narrative={pricingSummary.pricingNarrative}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 border-b border-zinc-200 p-5 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Estimated Value At Stake"
                      value={formatCurrency(pricingSummary.valueAtStake)}
                      detail={`Base signal ${formatCurrency(pricingSummary.baseValueAtStake)}`}
                    />
                    <MetricCard
                      label="Client Risk Anchor"
                      value={formatCurrency(pricingSummary.riskProfile)}
                      detail={pricingSummary.matterProfileSignalLabel}
                    />
                    <MetricCard
                      label="Fee Band"
                      value={`${formatPercent(pricingSummary.feeBandLowPercent)}–${formatPercent(pricingSummary.feeBandHighPercent)}`}
                      detail="Adjusted by the Gemini pricing pass"
                    />
                    <MetricCard
                      label="Matter Complexity"
                      value={`${pricingSummary.documentComplexityScore}/100`}
                      detail={`Exposure proxy ${formatPercent(pricingSummary.exposurePercent)}`}
                    />
                  </div>

                  <div className="p-5 border-b border-zinc-200">
                    <SectionTitle
                      title="Value Breakdown"
                      subtitle="Gemini-adjusted value dimensions translated into the pricing recommendation."
                    />
                    <div className="space-y-4">
                      {pricingSummary.dimensions.map((dimension) => (
                        <div key={dimension.key} className="space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-[13px] font-medium text-zinc-900">{dimension.label}</p>
                              <p className="text-[11px] text-zinc-500">{dimension.description}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[13px] font-semibold text-zinc-900">{formatCurrency(dimension.amount)}</p>
                              <p className="text-[11px] text-zinc-400">{dimension.score}/100</p>
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${dimension.colorClass}`}
                              style={{ width: `${dimension.score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-5 border-b border-zinc-200">
                    <SectionTitle
                      title="Business Unit Cross-Section"
                      subtitle="Where the answer set concentrated the most pricing-relevant detail."
                    />
                    <div className="space-y-3">
                      {pricingSummary.units.map((unit) => (
                        <div key={unit.businessUnit} className="flex items-center gap-4">
                          <div className="min-w-[150px]">
                            <p className="text-[13px] font-medium text-zinc-900">{unit.businessUnit}</p>
                            <p className="text-[11px] text-zinc-500">
                              {unit.answeredCount}/{unit.questionCount} answered · {unit.totalWords.toLocaleString()} words
                            </p>
                          </div>
                          <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.max(unit.sharePercent, 4)}%` }}
                            />
                          </div>
                          <div className="w-14 text-right text-[12px] text-zinc-500">
                            {unit.sharePercent.toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-5 border-b border-zinc-200">
                    <SectionTitle
                      title="Client Intake"
                      subtitle="Structured matter inputs captured before the written review questions."
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      {matterProfileSelections.map((item) => (
                        <div key={item.label} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                            {item.label}
                          </p>
                          <p className="mt-2 text-[14px] font-semibold text-zinc-900">{item.selectedLabel}</p>
                          <p className="mt-1 text-[12px] text-zinc-500">Weight {formatScore(item.score)}</p>
                        </div>
                      ))}
                      <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                          Risk Profile
                        </p>
                        <p className="mt-2 text-[14px] font-semibold text-zinc-900">
                          {formatCurrency(pricingSummary.riskProfile)}
                        </p>
                        <p className="mt-1 text-[12px] text-zinc-500">
                          Adjustment factor {pricingSummary.matterProfileAdjustment.toFixed(2)}x
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 border-b border-zinc-200">
                    <SectionTitle
                      title="Input Transparency"
                      subtitle="The most detailed answers driving the recommendation."
                    />
                    <div className="space-y-3">
                      {pricingSummary.highlights.map((highlight, index) => (
                        <div key={`${highlight.businessUnit}-${index}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-700 border border-zinc-200">
                              {highlight.businessUnit}
                            </span>
                            <span className="text-[11px] text-zinc-500">{highlight.words} words</span>
                          </div>
                          <p className="mt-3 text-[13px] font-medium text-zinc-900">{highlight.question}</p>
                          <p className="mt-2 text-[12px] text-zinc-600 leading-relaxed">{highlight.preview}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-5">
                    <SectionTitle
                      title="Pricing Summary"
                      subtitle="Gemini narrative plus the anchor metrics behind the final recommendation."
                    />
                    <div className="space-y-3">
                      <SummaryRow label="Latest 10-K" value={`${pricingSummary.filingDateLabel} filing`} />
                      <SummaryRow label="Primary value driver" value={pricingSummary.biggestDriver} />
                      <SummaryRow label="Matter signal" value={`${pricingSummary.matterProfileScore}/100`} />
                      <SummaryRow label="Average response depth" value={`${pricingSummary.averageWords} words per answer`} />
                      <SummaryRow label="Recommended point" value={formatCurrency(pricingSummary.recommendedPrice)} />
                    </div>
                    <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        Key Assumptions
                      </p>
                      <div className="mt-3 space-y-2">
                        {pricingSummary.assumptions.map((assumption) => (
                          <p key={assumption} className="text-[12px] leading-relaxed text-zinc-600">
                            {assumption}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <a
                        href={analysis.latestTenK.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-[13px] font-medium text-zinc-900 hover:bg-zinc-50"
                      >
                        <FileText className="h-4 w-4" />
                        View filing
                      </a>
                      <button
                        onClick={() => setStep(5)}
                        className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-[13px] font-medium text-white hover:bg-zinc-800"
                      >
                        Refine Answers
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-2xl bg-zinc-200/50 px-4 py-3.5 focus-within:ring-2 ring-emerald-500/20 transition-all border border-transparent focus-within:bg-white focus-within:border-zinc-200">
      <div className="text-[12px] font-medium text-zinc-500 mb-1">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] text-zinc-900 placeholder-zinc-400 focus:outline-none"
      />
    </div>
  )
}

function MatterSliderCard({
  title,
  options,
  value,
  onValueChange
}: {
  title: string
  options: MatterProfileOption[]
  value: number
  onValueChange: (value: number) => void
}) {
  const selectedOption = options[value] ?? options[0]

  return (
    <div className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-[12px] text-zinc-500">Select the closest fit for this matter.</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-medium text-zinc-700">
          {selectedOption.label} · {formatScore(selectedOption.score)}
        </span>
      </div>

      <Slider
        max={options.length - 1}
        min={0}
        onValueChange={(nextValue) => onValueChange(clamp(Math.round(nextValue), 0, options.length - 1))}
        step={1}
        value={value}
      />

      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const isActive = index === value

          return (
            <button
              key={`${title}-${option.label}`}
              type="button"
              onClick={() => onValueChange(index)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RiskProfileCard({
  className,
  value,
  onValueChange
}: {
  className?: string
  value: number
  onValueChange: (value: number) => void
}) {
  const marks = [
    { label: '$0', value: 0 },
    { label: '$50M', value: 50000000 },
    { label: '$100M', value: 100000000 },
    { label: '$250M', value: RISK_PROFILE_MAX }
  ]

  return (
    <div className={`rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm space-y-4 ${className ?? ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900">Risk Profile</h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            What is the total dollar value you are prepared to expose?
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-[12px] font-medium text-zinc-700">
          {formatCurrency(value)}
        </span>
      </div>

      <Slider
        max={RISK_PROFILE_MAX}
        min={0}
        onValueChange={(nextValue) => onValueChange(clamp(nextValue, 0, RISK_PROFILE_MAX))}
        step={RISK_PROFILE_STEP}
        value={value}
      />

      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
        {marks.map((mark) => (
          <button
            key={mark.value}
            type="button"
            onClick={() => onValueChange(mark.value)}
            className="transition-colors hover:text-zinc-600"
          >
            {mark.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Prepared Exposure</p>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">$</span>
          <Input
            type="number"
            min={0}
            max={RISK_PROFILE_MAX}
            step={RISK_PROFILE_STEP}
            value={value}
            onChange={(event) => {
              const rawValue = event.target.value
              const nextValue = rawValue === '' ? 0 : Number(rawValue)
              onValueChange(clamp(Number.isNaN(nextValue) ? 0 : nextValue, 0, RISK_PROFILE_MAX))
            }}
            className="h-11 rounded-xl border-zinc-200 bg-white pl-7 text-[14px]"
          />
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-2 text-[20px] font-semibold text-zinc-900">{value}</p>
      <p className="mt-1 text-[12px] text-zinc-500">{detail}</p>
    </div>
  )
}

function PricingBandGraph({
  floor,
  recommended,
  ceiling,
  graphMoments,
  narrative
}: {
  floor: number
  recommended: number
  ceiling: number
  graphMoments: PricingCurvePoint[]
  narrative?: string
}) {
  const gradientId = useId()
  const chartData = graphMoments.map((moment, index) => ({
    ...moment,
    step: index,
    bandBase: moment.floor,
    bandSize: Math.max(moment.ceiling - moment.floor, 1)
  }))
  const chartMax = chartData.reduce((max, point) => Math.max(max, point.ceiling), ceiling)
  const chartMin = chartData.reduce((min, point) => Math.min(min, point.floor), floor)
  const currentPoint = chartData[chartData.length - 1]

  return (
    <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/70 p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-zinc-900">Value Pricing Curve</p>
          <p className="text-[12px] text-zinc-500">
            {narrative ?? 'Gemini returned a value-driven pricing path with a final recommended band.'}
          </p>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Spread {formatCurrency(Math.max(ceiling - floor, 0))}
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3">
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id={`${gradientId}-band`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.78" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0.16" />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#f4f4f5" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }}
                tickMargin={10}
              />
              <YAxis
                domain={[chartMin * 0.9, chartMax * 1.04]}
                tickCount={5}
                tickFormatter={formatCompactCurrency}
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }}
                width={64}
              />

              <Area dataKey="bandBase" stackId="pricing-band" stroke="transparent" fill="transparent" />
              <Area
                type="monotone"
                dataKey="bandSize"
                stackId="pricing-band"
                stroke="transparent"
                fill={`url(#${gradientId}-band)`}
              />
              <Line
                type="monotone"
                dataKey="ceiling"
                stroke="#10b981"
                strokeWidth={2.75}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="floor"
                stroke="#10b981"
                strokeWidth={2.75}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="recommended"
                stroke="#18181b"
                strokeWidth={2}
                strokeDasharray="8 8"
                dot={false}
                activeDot={false}
              />
              {currentPoint && (
                <ReferenceDot
                  x={currentPoint.label}
                  y={currentPoint.recommended}
                  r={5.5}
                  fill="#18181b"
                  stroke="#ffffff"
                  strokeWidth={2}
                  label={{
                    value: 'Recommended',
                    position: 'top',
                    fill: '#3f3f46',
                    fontSize: 11,
                    fontWeight: 600
                  }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-medium text-zinc-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Ceiling {formatCurrency(ceiling)}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-px w-4 border-t-2 border-dashed border-zinc-900" />
            Point {formatCurrency(recommended)}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Floor {formatCurrency(floor)}
          </span>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({
  title,
  subtitle
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{title}</h3>
      <p className="mt-1 text-[12px] text-zinc-500">{subtitle}</p>
    </div>
  )
}

function SummaryRow({
  label,
  value
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex justify-between items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <span className="text-[13px] text-zinc-600">{label}</span>
      <span className="text-[13px] font-semibold text-zinc-900 text-right">{value}</span>
    </div>
  )
}
