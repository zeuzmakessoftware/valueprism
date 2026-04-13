"use client"

import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { RISK_PROFILE_MAX, RISK_PROFILE_STEP, clamp, formatCurrency } from '@/components/types'

export function RiskProfileCard({
  className,
  value,
  onValueChange
}: {
  className?: string
  value: number
  onValueChange: (value: number) => void
}) {
  const marks = [
    { label: '$0', value: 0 },
    { label: '$5M', value: 5000000 },
    { label: '$10M', value: RISK_PROFILE_MAX }
  ]

  return (
    <div className={`rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm space-y-4 ${className ?? ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900">Risk Profile</h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            What is the total dollar value you are prepared to expose?
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-[12px] font-medium text-zinc-700">
          {formatCurrency(value)}
        </span>
      </div>

      <Slider
        max={RISK_PROFILE_MAX}
        min={0}
        onValueChange={(nextValue) => onValueChange(clamp(nextValue, 0, RISK_PROFILE_MAX))}
        step={RISK_PROFILE_STEP}
        value={value}
      />

      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
        {marks.map((mark) => (
          <button
            key={mark.value}
            type="button"
            onClick={() => onValueChange(mark.value)}
            className="transition-colors hover:text-zinc-600"
          >
            {mark.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Prepared Exposure</p>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-zinc-400">$</span>
          <Input
            type="number"
            min={0}
            max={RISK_PROFILE_MAX}
            step={RISK_PROFILE_STEP}
            value={value}
            onChange={(event) => {
              const rawValue = event.target.value
              const nextValue = rawValue === '' ? 0 : Number(rawValue)
              onValueChange(clamp(Number.isNaN(nextValue) ? 0 : nextValue, 0, RISK_PROFILE_MAX))
            }}
            className="h-11 rounded-xl border-zinc-200 bg-white pl-7 text-[14px]"
          />
        </div>
      </div>
    </div>
  )
}
