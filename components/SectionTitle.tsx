"use client"

export function SectionTitle({
  title,
  subtitle
}: {
  title: string
  subtitle: string
}) {
  return (
    <div className="mb-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{title}</h3>
      <p className="mt-1 text-[12px] text-zinc-500">{subtitle}</p>
    </div>
  )
}
