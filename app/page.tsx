"use client"

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

import {
  type AnalysisResult,
  type QuestionPlanCompletePayload,
  type QuestionPlanErrorPayload,
  type QuestionPlanProgressPayload,
  QUESTION_PLAN_MAX_ATTEMPTS,
  QUESTION_PLAN_STAGE_DETAILS,
  QUESTION_PLAN_STAGE_SEQUENCE,
} from '@/lib/question-plan'

import {
  type Company,
  type MatterProfile,
  type PricingSummary,
  type Step,
  type ValuePricingResponsePayload,
  ANALYSIS_REQUEST_TIMEOUT_MS,
  ANALYSIS_TOAST_ID,
  DEFAULT_MATTER_PROFILE,
  INITIAL_STAGE_ID,
  MATTER_PROFILE_SCORE_MAX,
  VALUE_PRICING_REQUEST_TIMEOUT_MS,
  VALUE_PRICING_TOAST_ID,
  buildMatterProfileContext,
  buildPricingSummary,
  clamp,
  createRequestError,
  getErrorMessage,
  getMatterProfileSelections,
  getMatterProfileSignalLabel,
  isRetriableRequestError,
  parseSseMessage,
  sleep,
  formatCurrency,
} from '@/components/types'

import { StepIndicator } from '@/components/StepIndicator'
import { StepCompanySearch } from '@/components/StepCompanySearch'
import { StepDocumentUpload } from '@/components/StepDocumentUpload'
import { StepMatterProfile } from '@/components/StepMatterProfile'
import { StepAnalyzing } from '@/components/StepAnalyzing'
import { StepQuestions } from '@/components/StepQuestions'
import { StepGeneratingPricing } from '@/components/StepGeneratingPricing'
import { StepResults } from '@/components/StepResults'

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
      description: 'Valueprism is synthesizing the matter inputs, uploaded documents, and completed answers.',
      duration: Infinity
    })

    try {
      const result = await requestValuePricing()
      setPricingSummary(result)
      setStep(7)
      toast.success('Value pricing output ready', {
        id: VALUE_PRICING_TOAST_ID,
        description: `Generated a Valueprism-backed pricing recommendation for ${analysis.company.name}.`
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
        <StepIndicator step={step} />

        <div className="relative min-h-[460px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <StepCompanySearch
                query={query}
                filtered={filtered}
                isOpen={isOpen}
                containerRef={containerRef}
                onQueryChange={(value) => {
                  resetAnalysis({ resetMatterProfile: true })
                  setQuery(value)
                  setSelectedCompany(null)
                  setIsOpen(true)
                }}
                onCompanySelect={(company) => {
                  resetAnalysis({ resetMatterProfile: true })
                  setQuery(company.title)
                  setSelectedCompany(company)
                  setIsOpen(false)
                }}
                onNext={() => {
                  if (!query.trim()) {
                    return
                  }

                  resetAnalysis({ resetMatterProfile: true })
                  setStep(2)
                }}
              />
            )}

            {step === 2 && (
              <StepDocumentUpload
                uploadedFiles={uploadedFiles}
                onFileChange={handleFileChange}
                onRemoveFile={removeFile}
                onBack={() => setStep(1)}
                onNext={() => {
                  if (uploadedFiles.length === 0) {
                    return
                  }

                  setStep(3)
                }}
              />
            )}

            {step === 3 && (
              <StepMatterProfile
                analysis={analysis}
                matterProfile={matterProfile}
                matterProfileScore={matterProfileScore}
                matterProfileSignalLabel={matterProfileSignalLabel}
                isAnalyzing={isAnalyzing}
                uploadedFilesCount={uploadedFiles.length}
                onMatterProfileChange={setMatterProfile}
                onBack={() => setStep(2)}
                onAnalyze={handleAnalyze}
              />
            )}

            {step === 4 && (
              <StepAnalyzing
                isAnalyzing={isAnalyzing}
                analysisAttempt={analysisAttempt}
                analysisProgress={analysisProgress}
                analysisError={analysisError}
                analysisStageIndex={analysisStageIndex}
                analysisProgressPercent={analysisProgressPercent}
                isGeneratingQuestions={isGeneratingQuestions}
                completedStageIds={completedStageIds}
                onBack={() => setStep(3)}
                onRetry={handleAnalyze}
              />
            )}

            {step === 5 && currentQuestion && analysis && (
              <StepQuestions
                analysis={analysis}
                questions={questions}
                currentQuestionIndex={currentQuestionIndex}
                currentAnswer={currentAnswer}
                answers={answers}
                completedQuestionCount={completedQuestionCount}
                matterProfileSignalLabel={matterProfileSignalLabel}
                riskProfile={matterProfile.riskProfile}
                pricingScaffold={pricingScaffold}
                onSetCurrentQuestionIndex={setCurrentQuestionIndex}
                onUpdateCurrentAnswer={updateCurrentAnswer}
                onPreviousQuestion={handlePreviousQuestion}
                onNextQuestion={handleNextQuestion}
              />
            )}

            {step === 6 && analysis && (
              <StepGeneratingPricing
                isGeneratingPricing={isGeneratingPricing}
                pricingError={pricingError}
                completedQuestionCount={completedQuestionCount}
                totalQuestionCount={questions.length}
                uploadedFilesCount={uploadedFiles.length}
                pricingScaffold={pricingScaffold}
                onBack={() => setStep(5)}
                onRetry={() => void handleGenerateValuePricing()}
              />
            )}

            {step === 7 && analysis && pricingSummary && (
              <StepResults
                analysis={analysis}
                pricingSummary={pricingSummary}
                matterProfileSelections={matterProfileSelections}
                onBackToQuestions={() => setStep(5)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
