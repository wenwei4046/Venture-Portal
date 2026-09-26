'use client'

import Link from 'next/link'

export default function PayslipNav({ backHref }: { backHref: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 print:hidden">
      <Link href={backHref} className="text-sm hover:text-accent transition-colors">
        ← Back to Director Salary
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
