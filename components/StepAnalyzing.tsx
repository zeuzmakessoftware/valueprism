"use client"

import { motion } from 'framer-motion'
import {
  QUESTION_PLAN_STAGE_DETAILS,
  QUESTION_PLAN_STAGE_SEQUENCE,
  QUESTION_PLAN_MAX_ATTEMPTS,
  type QuestionPlanProgressPayload,
  type QuestionPlanStageId
} from '@/lib/question-plan'

export function StepAnalyzing({
  isAnalyzing,
  analysisAttempt,
  analysisProgress,
  analysisError,
  analysisStageIndex,
  analysisProgressPercent,
  isGeneratingQuestions,
  completedStageIds,
  onBack,
  onRetry
}: {
  isAnalyzing: boolean
  analysisAttempt: number
  analysisProgress: QuestionPlanProgressPayload
  analysisError: string
  analysisStageIndex: number
  analysisProgressPercent: number
  isGeneratingQuestions: boolean
  completedStageIds: QuestionPlanStageId[]
  onBack: () => void
  onRetry: () => void
}) {
  return (
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
              onClick={onBack}
              className="h-11 px-5 rounded-xl border border-zinc-300 bg-white text-zinc-900 text-[14px] font-medium"
            >
              Back
            </button>
            <button
              onClick={onRetry}
              className="h-11 px-5 rounded-xl bg-zinc-900 text-white text-[14px] font-medium"
            >
              Try Again
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}
