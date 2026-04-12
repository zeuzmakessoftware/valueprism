"use client"

import { motion } from 'framer-motion'
import { type Step, STEP_SEQUENCE } from '@/components/types'

export function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex justify-center mb-10">
      <div className="flex items-center gap-2">
        {STEP_SEQUENCE.map((item) => (
          <motion.div
            key={item}
            animate={{
              width: step === item ? 32 : 12,
              backgroundColor: step >= item ? '#10b981' : '#d4d4d8'
            }}
            className="h-1.5 rounded-full"
          />
        ))}
      </div>
    </div>
  )
}
