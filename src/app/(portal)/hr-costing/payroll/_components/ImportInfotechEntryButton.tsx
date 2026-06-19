'use client'

import Link from 'next/link'

interface Props {
  period: string
}

// Plain link — the verbatim import wizard creates missing payroll rows
// itself, so pre-creating the period here is no longer needed.
export default function ImportInfotechEntryButton({ period }: Props) {
  return (
    <Link
      href={`/hr-costing/payroll/${period}/import`}
      className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
    >
      Import InfoTech
    </Link>
  )
}
