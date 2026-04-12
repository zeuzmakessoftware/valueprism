"use client"

import { motion } from 'framer-motion'
import type { AnalysisResult } from '@/lib/question-plan'

import { MatterSliderCard } from '@/components/MatterSliderCard'
import { RiskProfileCard } from '@/components/RiskProfileCard'
import {
  type MatterProfile,
  BUSINESS_IMPACT_OPTIONS,
  FOOTPRINT_OPTIONS,
  COMPLEXITY_OPTIONS,
  URGENCY_OPTIONS,
  COUNTERPARTY_OPTIONS,
  VISIBILITY_OPTIONS
} from '@/components/types'

export function StepMatterProfile({
  analysis,
  matterProfile,
  matterProfileScore,
  matterProfileSignalLabel,
  isAnalyzing,
  uploadedFilesCount,
  onMatterProfileChange,
  onBack,
  onAnalyze
}: {
  analysis: AnalysisResult | null
  matterProfile: MatterProfile
  matterProfileScore: number
  matterProfileSignalLabel: string
  isAnalyzing: boolean
  uploadedFilesCount: number
  onMatterProfileChange: (updater: (prev: MatterProfile) => MatterProfile) => void
  onBack: () => void
  onAnalyze: () => void
}) {
  const hasAnalysis = analysis !== null

  return (
    <>
      {hasAnalysis ? (
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

          <MatterProfileSliders
            matterProfile={matterProfile}
            onMatterProfileChange={onMatterProfileChange}
          />

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white font-medium text-zinc-900"
            >
              Back
            </button>
            <button
              onClick={onAnalyze}
              disabled={uploadedFilesCount === 0 || isAnalyzing}
              className="h-12 flex-[2] rounded-2xl bg-zinc-900 text-white font-medium shadow-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {hasAnalysis ? 'Regenerate Questions' : 'Generate Questions'}
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="step3-empty"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-6"
        >
          <MatterProfileSliders
            matterProfile={matterProfile}
            onMatterProfileChange={onMatterProfileChange}
          />

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white font-medium text-zinc-900"
            >
              Back
            </button>
            <button
              onClick={onAnalyze}
              disabled={uploadedFilesCount === 0 || isAnalyzing}
              className="h-12 flex-[2] rounded-2xl bg-zinc-900 text-white font-medium shadow-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {hasAnalysis ? 'Regenerate Questions' : 'Generate Questions'}
            </button>
          </div>
        </motion.div>
      )}
    </>
  )
}

function MatterProfileSliders({
  matterProfile,
  onMatterProfileChange
}: {
  matterProfile: MatterProfile
  onMatterProfileChange: (updater: (prev: MatterProfile) => MatterProfile) => void
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <MatterSliderCard
        title="Business Impact"
        options={BUSINESS_IMPACT_OPTIONS}
        value={matterProfile.businessImpactIndex}
        onValueChange={(value) =>
          onMatterProfileChange((prev) => ({ ...prev, businessImpactIndex: value }))
        }
      />
      <MatterSliderCard
        title="Footprint"
        options={FOOTPRINT_OPTIONS}
        value={matterProfile.footprintIndex}
        onValueChange={(value) =>
          onMatterProfileChange((prev) => ({ ...prev, footprintIndex: value }))
        }
      />
      <MatterSliderCard
        title="Complexity"
        options={COMPLEXITY_OPTIONS}
        value={matterProfile.complexityIndex}
        onValueChange={(value) =>
          onMatterProfileChange((prev) => ({ ...prev, complexityIndex: value }))
        }
      />
      <MatterSliderCard
        title="Urgency"
        options={URGENCY_OPTIONS}
        value={matterProfile.urgencyIndex}
        onValueChange={(value) =>
          onMatterProfileChange((prev) => ({ ...prev, urgencyIndex: value }))
        }
      />
      <RiskProfileCard
        className="md:col-span-2"
        value={matterProfile.riskProfile}
        onValueChange={(value) =>
          onMatterProfileChange((prev) => ({ ...prev, riskProfile: value }))
        }
      />
      <MatterSliderCard
        title="Counterparty"
        options={COUNTERPARTY_OPTIONS}
        value={matterProfile.counterpartyIndex}
        onValueChange={(value) =>
          onMatterProfileChange((prev) => ({ ...prev, counterpartyIndex: value }))
        }
      />
      <MatterSliderCard
        title="Visibility"
        options={VISIBILITY_OPTIONS}
        value={matterProfile.visibilityIndex}
        onValueChange={(value) =>
          onMatterProfileChange((prev) => ({ ...prev, visibilityIndex: value }))
        }
      />
    </div>
  )
}
