"use client"

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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

const ANALYSIS_TOAST_ID = 'question-plan-analysis'
const ANALYSIS_REQUEST_TIMEOUT_MS = 90000
const INITIAL_STAGE_ID: QuestionPlanStageId = QUESTION_PLAN_STAGE_SEQUENCE[0]

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

export default function Home() {
  const [step, setStep] = useState(1)
  const [query, setQuery] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [filtered, setFiltered] = useState<Company[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answer, setAnswer] = useState('')
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

  const resetAnalysis = () => {
    setAnalysis(null)
    setAnalysisError('')
    setCurrentQuestionIndex(0)
    setAnswer('')
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
      resetAnalysis()
      setUploadedFiles((prev) => [...prev, ...newFiles])
      e.target.value = ''
    }
  }

  const removeFile = (index: number) => {
    resetAnalysis()
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
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
      } catch (err) {
        console.error('Failed to fetch tickers', err)
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
    } catch (err) {
      const message = getErrorMessage(err)
      setAnalysisError(message)
      toast.error('Analysis failed', {
        id: ANALYSIS_TOAST_ID,
        description: message
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const questions = analysis?.questions ?? []
  const currentQuestion = questions[currentQuestionIndex]

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1)
      setAnswer('')
    } else {
      toast.success('Analysis complete', {
        description: 'The review flow reached the end of the generated questions.'
      })
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f4f5] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[440px]">
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                animate={{
                  width: step === i ? 32 : 12,
                  backgroundColor: step >= i ? '#10b981' : '#d4d4d8'
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
                    if (!query.trim()) return
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
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
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
                  <button onClick={() => setStep(1)} className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white font-medium text-zinc-900">
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
                className="space-y-6"
              >
                <div className="space-y-4">
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
                    <p className="text-[12px] text-zinc-500 leading-relaxed">
                      Question plan generated from {analysis.company.name}&apos;s {analysis.latestTenK.filingDate} 10-K.{' '}
                      <a
                        href={analysis.latestTenK.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                      >
                        View filing
                      </a>
                    </p>
                  </div>

                  <div className="bg-emerald-50 text-emerald-900 p-4 rounded-2xl rounded-bl-none border border-emerald-100 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {currentQuestion.businessUnit}
                    </p>
                    <p className="text-[14px] leading-relaxed font-medium">{currentQuestion.question}</p>
                  </div>

                  <div className="relative">
                    <textarea
                      className="w-full min-h-[120px] p-4 bg-white border border-zinc-200 rounded-2xl text-[14px] focus:ring-2 ring-emerald-500/20 focus:outline-none resize-none shadow-sm"
                      placeholder="Type your answer here..."
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <p className="text-[12px] text-zinc-400 font-medium uppercase tracking-wider">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </p>
                  <button
                    disabled={!answer}
                    onClick={handleNextQuestion}
                    className="h-11 px-6 rounded-xl bg-zinc-900 text-white text-[14px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
                  >
                    {currentQuestionIndex === questions.length - 1 ? 'Finish Analysis' : 'Next Question'}
                  </button>
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
  onChange: (val: string) => void
}) {
  return (
    <div className="rounded-2xl bg-zinc-200/50 px-4 py-3.5 focus-within:ring-2 ring-emerald-500/20 transition-all border border-transparent focus-within:bg-white focus-within:border-zinc-200">
      <div className="text-[12px] font-medium text-zinc-500 mb-1">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] text-zinc-900 placeholder-zinc-400 focus:outline-none"
      />
    </div>
  )
}
