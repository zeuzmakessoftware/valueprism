"use client"

import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'
import type { AnalysisResult } from '@/lib/question-plan'

import { MetricCard } from '@/components/MetricCard'
import { PricingBandGraph } from '@/components/PricingBandGraph'
import { SectionTitle } from '@/components/SectionTitle'
import { SummaryRow } from '@/components/SummaryRow'
import {
  type PricingSummary,
  type MatterProfileSummaryItem,
  formatCurrency,
  formatPercent,
  formatScore
} from '@/components/types'

export function StepResults({
  analysis,
  pricingSummary,
  matterProfileSelections,
  onBackToQuestions
}: {
  analysis: AnalysisResult
  pricingSummary: PricingSummary
  matterProfileSelections: MatterProfileSummaryItem[]
  onBackToQuestions: () => void
}) {
  return (
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
            onClick={onBackToQuestions}
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
              onClick={onBackToQuestions}
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-[13px] font-medium text-white hover:bg-zinc-800"
            >
              Refine Answers
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
