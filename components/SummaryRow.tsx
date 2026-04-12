"use client"

export function SummaryRow({
  label,
  value
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex justify-between items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <span className="text-[13px] text-zinc-600">{label}</span>
      <span className="text-[13px] font-semibold text-zinc-900 text-right">{value}</span>
    </div>
  )
}
