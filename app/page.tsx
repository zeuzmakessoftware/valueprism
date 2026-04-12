"use client"

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'
import { toast } from 'sonner'

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

type Step = 1 | 2 | 3 | 4 | 5

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

type PricingSummary = {
  totalQuestions: number
  answeredQuestions: number
  totalWords: number
  averageWords: number
  completionPercent: number
  marketSignalLabel: string
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
  dimensions: ValueDimensionScore[]
  units: UnitSummary[]
  highlights: Array<{
    businessUnit: string
    question: string
    preview: string
    words: number
  }>
  filingDateLabel: string
}

const ANALYSIS_TOAST_ID = 'question-plan-analysis'
const ANALYSIS_REQUEST_TIMEOUT_MS = 90000
const INITIAL_STAGE_ID: QuestionPlanStageId = QUESTION_PLAN_STAGE_SEQUENCE[0]
const STEP_SEQUENCE: Step[] = [1, 2, 3, 4, 5]
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

  return error instanceof Error ? error.message : 'Failed to generate step 4 questions'
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

function buildPricingSummary(analysis: AnalysisResult, answers: string[]): PricingSummary {
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
  const documentComplexityScore = clamp(
    Math.round(answerDepthScore * 0.55 + completionPercent * 0.25 + totalDimensionScore / 8),
    20,
    96
  )

  const valueAtStake = roundCurrency(
    totalDimensionScore * 90000 + totalWords * 2400 + answeredQuestions * 650000,
    25000
  )

  const exposurePercent = clamp(0.45 + documentComplexityScore / 12, 0.6, 8.5)

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

  return {
    totalQuestions,
    answeredQuestions,
    totalWords,
    averageWords,
    completionPercent,
    marketSignalLabel,
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
    dimensions,
    units,
    highlights,
    filingDateLabel: formatFilingDate(analysis.latestTenK.filingDate)
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
  const pricingSummary = analysis ? buildPricingSummary(analysis, answers) : null

  const resetAnalysis = () => {
    setAnalysis(null)
    setAnalysisError('')
    setCurrentQuestionIndex(0)
    setAnswers([])
    setAnalysisAttempt(0)
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
        let message = 'Failed to generate step 4 questions'

        try {
          const payload = (await response.json()) as { error?: string }
          message = payload.error ?? message
        } catch {
          try {
            message = await response.text()
          } catch {
            message = 'Failed to generate step 4 questions'
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

      throw createRequestError('The analysis stream ended before returning step 4 questions.')
    } finally {
      clearTimeout(timeout)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files)
      resetAnalysis()
      setUploadedFiles((prev) => [...prev, ...newFiles])
      event.target.value = ''
    }
  }

  const removeFile = (index: number) => {
    resetAnalysis()
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
    }
  }, [])

  const handleAnalyze = async () => {
    if (!query.trim() || uploadedFiles.length === 0 || isAnalyzing) {
      return
    }

    resetAnalysis()
    setIsOpen(false)
    setIsAnalyzing(true)
    setStep(3)

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
          setStep(4)
          toast.success('Step 4 questions ready', {
            id: ANALYSIS_TOAST_ID,
            description: `Generated ${payload.questions.length} tailored prompts for ${payload.company.name}.`
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

  const updateCurrentAnswer = (value: string) => {
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

    setStep(5)
  }

  const containerWidth =
    step === 5 ? 'max-w-[960px]' : step === 4 ? 'max-w-[620px]' : 'max-w-[440px]'

  return (
    <div className="min-h-screen bg-[#f4f4f5] flex items-center justify-center p-6 font-sans">
      <div className={`w-full ${containerWidth}`}>
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
                      resetAnalysis()
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
                            resetAnalysis()
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

                    resetAnalysis()
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
                    onClick={handleAnalyze}
                    disabled={uploadedFiles.length === 0 || isAnalyzing}
                    className="h-12 flex-[2] rounded-2xl bg-emerald-600 text-white font-medium shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Analyze {uploadedFiles.length} {uploadedFiles.length === 1 ? 'Document' : 'Documents'}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
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
                        onClick={() => setStep(2)}
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

            {step === 4 && currentQuestion && analysis && (
              <motion.div
                key="step4"
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
                    <p className="text-[12px] text-zinc-500 leading-relaxed">
                      Question plan generated from {analysis.company.name}&apos;s {pricingSummary?.filingDateLabel} 10-K.{' '}
                      <a
                        href={analysis.latestTenK.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                      >
                        View filing
                      </a>
                    </p>
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
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    className="h-11 px-4 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-[14px] font-medium disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <p className="text-[12px] text-zinc-400 font-medium uppercase tracking-wider">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </p>
                  <button
                    disabled={!currentAnswer.trim()}
                    onClick={handleNextQuestion}
                    className="h-11 px-6 rounded-xl bg-zinc-900 text-white text-[14px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
                  >
                    {currentQuestionIndex === questions.length - 1 ? 'View Pricing Result' : 'Next Question'}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 5 && analysis && pricingSummary && (
              <motion.div
                key="step5"
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
                        Client-side preview based on the uploaded materials and the completed questions. Firm-side inputs would refine the point within the band.
                      </p>
                    </div>
                    <button
                      onClick={() => setStep(4)}
                      className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>
                  </div>

                  <div className="p-8 text-center border-b border-zinc-200">
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
                  </div>

                  <div className="grid gap-4 p-5 md:grid-cols-3 border-b border-zinc-200">
                    <MetricCard
                      label="Estimated Value At Stake"
                      value={formatCurrency(pricingSummary.valueAtStake)}
                      detail={`Exposure proxy ${formatPercent(pricingSummary.exposurePercent)}`}
                    />
                    <MetricCard
                      label="Fee Band"
                      value={`${formatPercent(pricingSummary.feeBandLowPercent)}–${formatPercent(pricingSummary.feeBandHighPercent)}`}
                      detail="Mapped from the indicative deck curve"
                    />
                    <MetricCard
                      label="Document Complexity"
                      value={`${pricingSummary.documentComplexityScore}/100`}
                      detail={`${pricingSummary.answeredQuestions}/${pricingSummary.totalQuestions} questions answered`}
                    />
                  </div>

                  <div className="p-5 border-b border-zinc-200">
                    <SectionTitle
                      title="Value Breakdown"
                      subtitle="Four value dimensions from the pitch deck translated into this pricing preview."
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
                      subtitle="A simple hackathon-friendly translation of the deck logic."
                    />
                    <div className="space-y-3">
                      <SummaryRow label="Latest 10-K" value={`${pricingSummary.filingDateLabel} filing`} />
                      <SummaryRow label="Primary value driver" value={pricingSummary.biggestDriver} />
                      <SummaryRow label="Average response depth" value={`${pricingSummary.averageWords} words per answer`} />
                      <SummaryRow label="Recommended point" value={formatCurrency(pricingSummary.recommendedPrice)} />
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
                        onClick={() => setStep(4)}
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
