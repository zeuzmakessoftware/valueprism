"use client"

import { motion } from 'framer-motion'
import type { AnalysisResult } from '@/lib/question-plan'

import type { PricingSummary } from '@/components/types'
import { formatCurrency } from '@/components/types'

export function StepQuestions({
  analysis,
  questions,
  currentQuestionIndex,
  currentAnswer,
  answers,
  completedQuestionCount,
  matterProfileSignalLabel,
  riskProfile,
  pricingScaffold,
  onSetCurrentQuestionIndex,
  onUpdateCurrentAnswer,
  onPreviousQuestion,
  onNextQuestion
}: {
  analysis: AnalysisResult
  questions: AnalysisResult['questions']
  currentQuestionIndex: number
  currentAnswer: string
  answers: string[]
  completedQuestionCount: number
  matterProfileSignalLabel: string
  riskProfile: number
  pricingScaffold: PricingSummary | null
  onSetCurrentQuestionIndex: (index: number) => void
  onUpdateCurrentAnswer: (value: string) => void
  onPreviousQuestion: () => void
  onNextQuestion: () => void
}) {
  const currentQuestion = questions[currentQuestionIndex]

  if (!currentQuestion) {
    return null
  }

  return (
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
              {matterProfileSignalLabel} · risk anchor {formatCurrency(riskProfile)}
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
          onChange={(event) => onUpdateCurrentAnswer(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => {
          const isActive = index === currentQuestionIndex
          const isAnswered = Boolean(answers[index]?.trim())

          return (
            <button
              key={`${question.businessUnit}-${index}`}
              onClick={() => onSetCurrentQuestionIndex(index)}
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
          onClick={onPreviousQuestion}
          className="h-11 px-4 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-[14px] font-medium disabled:opacity-50"
        >
          {currentQuestionIndex === 0 ? 'Matter Inputs' : 'Previous'}
        </button>
        <p className="text-[12px] text-zinc-400 font-medium uppercase tracking-wider">
          Question {currentQuestionIndex + 1} of {questions.length}
        </p>
        <button
          disabled={!currentAnswer.trim()}
          onClick={onNextQuestion}
          className="h-11 px-6 rounded-xl bg-zinc-900 text-white text-[14px] font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
        >
          {currentQuestionIndex === questions.length - 1 ? 'Generate Gemini Pricing Output' : 'Next Question'}
        </button>
      </div>
    </motion.div>
  )
}
