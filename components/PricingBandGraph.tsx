"use client"

import { useId } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis
} from 'recharts'

import { type PricingCurvePoint, formatCompactCurrency, formatCurrency } from '@/components/types'

export function PricingBandGraph({
  floor,
  recommended,
  ceiling,
  graphMoments,
  narrative
}: {
  floor: number
  recommended: number
  ceiling: number
  graphMoments: PricingCurvePoint[]
  narrative?: string
}) {
  const gradientId = useId()
  const chartData = graphMoments.map((moment, index) => ({
    ...moment,
    step: index,
    bandBase: moment.floor,
    bandSize: Math.max(moment.ceiling - moment.floor, 1)
  }))
  const chartMax = chartData.reduce((max, point) => Math.max(max, point.ceiling), ceiling)
  const chartMin = chartData.reduce((min, point) => Math.min(min, point.floor), floor)
  const currentPoint = chartData[chartData.length - 1]

  return (
    <div className="rounded-[28px] border border-zinc-200 bg-zinc-50/70 p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] font-medium text-zinc-900">Value Pricing Curve</p>
          <p className="text-[12px] text-zinc-500">
            {narrative ?? 'Valueprism returned a value-driven pricing path with a final recommended band.'}
          </p>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Spread {formatCurrency(Math.max(ceiling - floor, 0))}
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3">
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id={`${gradientId}-band`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.78" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0.16" />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#f4f4f5" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }}
                tickMargin={10}
              />
              <YAxis
                domain={[chartMin * 0.9, chartMax * 1.04]}
                tickCount={5}
                tickFormatter={formatCompactCurrency}
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }}
                width={64}
              />

              <Area dataKey="bandBase" stackId="pricing-band" stroke="transparent" fill="transparent" />
              <Area
                type="monotone"
                dataKey="bandSize"
                stackId="pricing-band"
                stroke="transparent"
                fill={`url(#${gradientId}-band)`}
              />
              <Line
                type="monotone"
                dataKey="ceiling"
                stroke="#10b981"
                strokeWidth={2.75}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="floor"
                stroke="#10b981"
                strokeWidth={2.75}
                dot={false}
                activeDot={false}
              />
              <Line
                type="monotone"
                dataKey="recommended"
                stroke="#18181b"
                strokeWidth={2}
                strokeDasharray="8 8"
                dot={false}
                activeDot={false}
              />
              {currentPoint && (
                <ReferenceDot
                  x={currentPoint.label}
                  y={currentPoint.recommended}
                  r={5.5}
                  fill="#18181b"
                  stroke="#ffffff"
                  strokeWidth={2}
                  label={{
                    value: 'Recommended',
                    position: 'top',
                    fill: '#3f3f46',
                    fontSize: 11,
                    fontWeight: 600
                  }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-medium text-zinc-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Ceiling {formatCurrency(ceiling)}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-px w-4 border-t-2 border-dashed border-zinc-900" />
            Point {formatCurrency(recommended)}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Floor {formatCurrency(floor)}
          </span>
        </div>
      </div>
    </div>
  )
}
