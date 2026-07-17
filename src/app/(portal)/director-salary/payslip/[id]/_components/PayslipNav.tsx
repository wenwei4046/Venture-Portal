'use client'

import Link from 'next/link'

export default function PayslipNav({ backHref }: { backHref: string }) {
  return (
    <div className="flex items-center justify-between mb-4 print:hidden">
      <Link href={backHref} className="text-sm text-muted hover:text-accent font-sans">
        ← Back to Director Salary
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
