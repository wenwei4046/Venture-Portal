'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function PrintButton() {
  const sp = useSearchParams()
  const backUrl = sp?.get('back') ?? '..'

  return (
    <div className="flex items-center justify-between mb-4 print:hidden">
      <Link
        href={backUrl}
        className="text-sm text-muted hover:text-accent font-sans"
      >
        ← Back to payroll grid
      </Link>
      <button
        onClick={() => window.print()}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md"
      >
        Print / Save as PDF
      </button>
    </div>
  )
}
