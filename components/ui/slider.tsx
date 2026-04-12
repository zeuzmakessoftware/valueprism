"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

type SliderProps = {
  className?: string
  disabled?: boolean
  max?: number
  min?: number
  step?: number
  value: number
  onValueChange: (value: number) => void
}

function Slider({
  className,
  disabled = false,
  max = 100,
  min = 0,
  step = 1,
  value,
  onValueChange,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      disabled={disabled}
      max={max}
      min={min}
      onValueChange={(nextValue) => onValueChange(nextValue as number)}
      step={step}
      thumbAlignment="edge-client-only"
      value={value}
    >
      <SliderPrimitive.Control className="relative flex w-full items-center py-2">
        <SliderPrimitive.Track className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-200">
          <SliderPrimitive.Indicator className="absolute h-full rounded-full bg-zinc-900" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block size-5 shrink-0 rounded-full border-2 border-white bg-zinc-900 shadow-[0_6px_18px_rgba(24,24,27,0.16)] outline-none transition-transform focus-visible:ring-4 focus-visible:ring-emerald-500/20 data-[dragging]:scale-105" />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
