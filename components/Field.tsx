"use client"

export function Field({
  label,
  value,
  placeholder,
  onChange
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-2xl bg-zinc-200/50 px-4 py-3.5 focus-within:ring-2 ring-emerald-500/20 transition-all border border-transparent focus-within:bg-white focus-within:border-zinc-200">
      <div className="text-[12px] font-medium text-zinc-500 mb-1">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] text-zinc-900 placeholder-zinc-400 focus:outline-none"
      />
    </div>
  )
}
