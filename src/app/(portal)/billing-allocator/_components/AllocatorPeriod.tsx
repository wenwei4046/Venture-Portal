'use client'

import { usePathname, useRouter } from 'next/navigation'

// The month picker in the page head (2026-10-07, the allocator on the sheet).
// It navigates by ?period= only; the tabs below restart for the month the
// server then renders (AllocatorTabs is keyed on it).
export default function AllocatorPeriod({ period }: { period: string }) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <span className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-[0.06em] text-graphite font-sans">Period</span>
      <input
        type="month"
        aria-label="Period"
        value={period}
        onChange={(e) => e.target.value && router.push(`${pathname}?period=${e.target.value}`)}
        className="px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
    </span>
  )
}
