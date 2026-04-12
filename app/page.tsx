"use client"

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Company = {
  ticker: string
  title: string
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      // Convert FileList to Array and add to state
      const newFiles = Array.from(e.target.files)
      setUploadedFiles(prev => [...prev, ...newFiles])
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const questions = [
    "Based on the 10K, what are the primary risks associated with the company's dependency on overseas manufacturing?",
    "How has the R&D expenditure trended over the last three fiscal years relative to total revenue?",
    "What specific language does management use to describe their competitive advantage in the current market?",
    "Are there any notable changes in the 'Legal Proceedings' section compared to the previous year's filing?"
  ]

  useEffect(() => {
    async function fetchCompanies() {
      try {
        const res = await fetch('/api/tickers')
        const data = await res.json()
        const list = Object.values(data).map((c: any) => ({
          ticker: c.ticker,
          title: c.title
        }))
        setCompanies(list)
      } catch (err) {
        console.error("Failed to fetch tickers", err)
      }
    }
    fetchCompanies()
  }, [])

  useEffect(() => {
    if (step === 3) {
      const timer = setTimeout(() => setStep(4), 5000)
      return () => clearTimeout(timer)
    }
  }, [step])

  useEffect(() => {
    if (query.length < 2) {
      setFiltered([])
      return
    }
    const results = companies
      .filter(c => 
        c.title.toLowerCase().includes(query.toLowerCase()) || 
        c.ticker.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 6)
    setFiltered(results)
  }, [query, companies])

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
      setAnswer('')
    } else {
      alert("Analysis Complete!")
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f4f5] flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[440px]">
        
        {/* Progress Bubbles */}
        <div className="flex justify-center mb-10">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((i) => (
              <motion.div 
                key={i}
                animate={{ 
                  width: step === i ? 32 : 12,
                  backgroundColor: step >= i ? "#10b981" : "#d4d4d8" 
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
                  <Field label="Company name" value={query} onChange={(v) => { setQuery(v); setIsOpen(true); }} placeholder="e.g. Apple" />
                  {isOpen && filtered.length > 0 && (
                    <div className="absolute z-10 w-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden">
                      {filtered.map((company) => (
                        <button key={company.ticker} className="flex flex-col w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-100 last:border-none" onClick={() => { setQuery(company.title); setIsOpen(false); }}>
                          <span className="text-[14px] font-medium text-zinc-900">{company.title}</span>
                          <span className="text-[12px] text-zinc-500">{company.ticker}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => query && setStep(2)} className="h-12 w-full rounded-2xl border border-zinc-300 bg-white text-[15px] font-medium text-zinc-900 hover:bg-zinc-50 transition-colors">Next</button>
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
                
                {/* Dropzone */}
                <label className="relative flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-zinc-300 rounded-3xl bg-zinc-50 cursor-pointer hover:border-emerald-500/50 transition-colors">
                  <input 
                    type="file" 
                    multiple 
                    className="hidden" 
                    onChange={handleFileChange} 
                  />
                  <span className="text-[14px] font-medium text-zinc-900">Drop files here</span>
                  <span className="text-[12px] text-zinc-500 mt-1">or click to browse</span>
                </label>

                {/* File List */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wider">Uploaded Files</p>
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {uploadedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl">
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-[13px] font-medium text-zinc-900 truncate">{file.name}</span>
                            <span className="text-[11px] text-zinc-500">{(file.size / 1024).toFixed(1)} KB</span>
                          </div>
                          <button 
                            onClick={() => removeFile(idx)}
                            className="text-zinc-400 hover:text-red-500 p-1"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white font-medium text-zinc-900">Back</button>
                  <button 
                    onClick={() => setStep(3)} 
                    disabled={uploadedFiles.length === 0}
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
                <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
                <h2 className="text-[18px] font-medium text-zinc-900 max-w-[280px] leading-snug">Analyzing Documents and Company's 10K for Questions</h2>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="bg-emerald-50 text-emerald-900 p-4 rounded-2xl rounded-bl-none border border-emerald-100">
                    <p className="text-[14px] leading-relaxed font-medium">
                      {questions[currentQuestionIndex]}
                    </p>
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
                    {currentQuestionIndex === questions.length - 1 ? "Finish Analysis" : "Next Question"}
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

function Field({ label, value, placeholder, onChange }: { label: string, value: string, placeholder?: string, onChange: (val: string) => void }) {
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