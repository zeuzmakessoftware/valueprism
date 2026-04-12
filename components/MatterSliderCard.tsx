"use client"

import { Slider } from '@/components/ui/slider'
import { type MatterProfileOption, clamp, formatScore } from '@/components/types'

export function MatterSliderCard({
  title,
  options,
  value,
  onValueChange
}: {
  title: string
  options: MatterProfileOption[]
  value: number
  onValueChange: (value: number) => void
}) {
  const selectedOption = options[value] ?? options[0]

  return (
    <div className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-[12px] text-zinc-500">Select the closest fit for this matter.</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-[10px] font-medium text-zinc-700">
          {selectedOption.label} · {formatScore(selectedOption.score)}
        </span>
      </div>

      <Slider
        max={options.length - 1}
        min={0}
        onValueChange={(nextValue) => onValueChange(clamp(Math.round(nextValue), 0, options.length - 1))}
        step={1}
        value={value}
      />

      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const isActive = index === value

          return (
            <button
              key={`${title}-${option.label}`}
              type="button"
              onClick={() => onValueChange(index)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
