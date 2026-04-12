"use client"

export function MetricCard({
  label,
  value,
  detail
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</p>
      <p className="mt-2 text-[20px] font-semibold text-zinc-900">{value}</p>
      <p className="mt-1 text-[12px] text-zinc-500">{detail}</p>
    </div>
  )
}
