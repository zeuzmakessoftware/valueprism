"use client"

import { motion } from 'framer-motion'

import { MetricCard } from '@/components/MetricCard'
import { type PricingSummary, formatCurrency } from '@/components/types'

export function StepGeneratingPricing({
  isGeneratingPricing,
  pricingError,
  completedQuestionCount,
  totalQuestionCount,
  uploadedFilesCount,
  pricingScaffold,
  onBack,
  onRetry
}: {
  isGeneratingPricing: boolean
  pricingError: string
  completedQuestionCount: number
  totalQuestionCount: number
  uploadedFilesCount: number
  pricingScaffold: PricingSummary | null
  onBack: () => void
  onRetry: () => void
}) {
  return (
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
                Post-Question Valueprism Pass
              </p>
              <h2 className="text-[22px] font-semibold text-zinc-900 leading-tight">
                Building the value pricing output
              </h2>
              <p className="text-[14px] text-zinc-600 leading-relaxed max-w-[560px]">
                Valueprism is processing the completed answers, the uploaded materials, and the matter inputs into a structured pricing recommendation and a value-driven chart path.
              </p>
            </div>
            <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            </div>
          </div>

          <div className="grid gap-4 border-b border-zinc-200 p-5 md:grid-cols-3">
            <MetricCard
              label="Completed Answers"
              value={`${completedQuestionCount}/${totalQuestionCount}`}
              detail="Structured reviewer responses ready"
            />
            <MetricCard
              label="Uploaded Documents"
              value={`${uploadedFilesCount}`}
              detail="Sent back through the Valueprism pricing pass"
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
              'Matter inputs and uploaded documents attached as Valueprism context.',
              'Valueprism is producing the final value pricing output and chart moments.'
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
              {pricingError || 'The Valueprism pricing pass did not return a usable result.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="h-11 px-5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-[14px] font-medium"
            >
              Back to Questions
            </button>
            <button
              onClick={onRetry}
              className="h-11 px-5 rounded-xl bg-zinc-900 text-white text-[14px] font-medium"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
