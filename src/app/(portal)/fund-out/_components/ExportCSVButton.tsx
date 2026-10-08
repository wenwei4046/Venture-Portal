'use client'

import { useState, useTransition } from 'react'
import { exportLoansCSV } from '../actions'
import { officeToday } from '@/lib/office-time'

export default function ExportCSVButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleExport() {
    setError(null)
    startTransition(async () => {
      try {
        const csv = await exportLoansCSV()
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `loan-portfolio-${officeToday()}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed')
      }
    })
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={isPending}
        className="btn-secondary"
      >
        {isPending ? 'Exporting...' : 'Export CSV'}
      </button>
      {error && <span className="text-sm font-serif italic text-danger ml-2">{error}</span>}
    </>
  )
}
