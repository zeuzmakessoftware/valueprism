"use client"

import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

type Company = {
  ticker: string
  title: string
}

type AnalysisQuestion = {
  businessUnit: string
  question: string
}

type AnalysisResult = {
  company: {
    name: string
    ticker: string
  }
  latestTenK: {
    filingDate: string
    accessionNumber: string
    url: string
  }
  businessUnits: string[]
  questions: AnalysisQuestion[]
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

  const resetAnalysis = () => {
    setAnalysis(null)
    setAnalysisError('')
    setCurrentQuestionIndex(0)
    setAnswer('')
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
        const list = Object.values(data).map((c) => ({
          ticker: c.ticker,
          title: c.title
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

  const handleAnalyze = async () => {
    if (!query.trim() || uploadedFiles.length === 0 || isAnalyzing) {
      return
    }

    resetAnalysis()
    setIsOpen(false)
    setIsAnalyzing(true)
    setStep(3)

    try {
      const formData = new FormData()
      formData.append('companyName', query.trim())

      if (selectedCompany?.ticker) {
        formData.append('companyTicker', selectedCompany.ticker)
      }

      uploadedFiles.forEach((file) => {
        formData.append('documents', file)
      })

      const res = await fetch('/api/question-plan', {
        method: 'POST',
        body: formData
      })
      const payload = await res.json()

      if (!res.ok) {
        throw new Error(payload.error ?? 'Failed to generate step 4 questions')
      }

      setAnalysis(payload)
      setStep(4)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate step 4 questions'
      setAnalysisError(message)
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
      alert('Analysis Complete!')
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

        <div className="relative min-h-[400px]">
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
                        <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl">
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
                className="flex flex-col items-center justify-center py-16 text-center space-y-6"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
                    <h2 className="text-[18px] font-medium text-zinc-900 max-w-[280px] leading-snug">
                      Analyzing your documents against the company&apos;s latest 10-K
                    </h2>
                  </>
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
