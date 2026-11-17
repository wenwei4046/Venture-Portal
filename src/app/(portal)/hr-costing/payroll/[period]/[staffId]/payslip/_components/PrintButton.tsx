'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { safeBack } from '@/lib/payroll-paycheck-url'

export default function PrintButton() {
  const sp = useSearchParams()
  // The paycheck it was opened from, on this site only (`safeBack`).
  const backUrl = safeBack(sp?.get('back'), '..')

  return (
    <div className="flex items-center justify-between mb-4 print:hidden">
      <Link
        href={backUrl}
        className="text-sm hover:underline underline-offset-4"
      >
        ← Back to payroll grid
      </Link>
      <button
        onClick={() => window.print()}
        className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
      >
        Print / Save as PDF
      </button>
    </div>
  )
}
