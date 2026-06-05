'use client'

import { useRouter, usePathname } from 'next/navigation'

/**
 * Month picker that navigates on change (no separate "Apply" / Enter needed).
 * Replaces the bare `<form><input type="month"></form>` that required the user
 * to press Enter to apply — picking a month from the native calendar left the
 * page on the old period, which read as "the report is empty".
 * Navigates to `?period=YYYY-MM`; the page derives from/to from it.
 */
export default function PeriodMonthPicker({ value }: { value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <input
      type="month"
      defaultValue={value}
      onChange={(e) => {
        if (e.target.value) router.push(`${pathname}?period=${e.target.value}`)
      }}
      className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
    />
  )
}
