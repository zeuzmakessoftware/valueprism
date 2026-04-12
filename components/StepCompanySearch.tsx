"use client"

import React from 'react'
import { motion } from 'framer-motion'

import { Field } from '@/components/Field'
import type { Company } from '@/components/types'

export function StepCompanySearch({
  query,
  filtered,
  isOpen,
  containerRef,
  onQueryChange,
  onCompanySelect,
  onNext
}: {
  query: string
  filtered: Company[]
  isOpen: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  onQueryChange: (value: string) => void
  onCompanySelect: (company: Company) => void
  onNext: () => void
}) {
  return (
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
          onChange={onQueryChange}
          placeholder="e.g. Apple"
        />
        {isOpen && filtered.length > 0 && (
          <div className="absolute z-10 w-full mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl overflow-hidden">
            {filtered.map((company) => (
              <button
                key={company.ticker}
                className="flex flex-col w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-100 last:border-none"
                onClick={() => onCompanySelect(company)}
              >
                <span className="text-[14px] font-medium text-zinc-900">{company.title}</span>
                <span className="text-[12px] text-zinc-500">{company.ticker}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onNext}
        className="h-12 w-full rounded-2xl border border-zinc-300 bg-white text-[15px] font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
      >
        Next
      </button>
    </motion.div>
  )
}
