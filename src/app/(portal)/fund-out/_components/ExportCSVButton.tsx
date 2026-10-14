'use client'

import { useTransition } from 'react'
import { flash } from '@/components/hrv/toast'
import { HeadButton } from '@/components/finv/Hub'
import { exportLoansCSV } from '../actions'
import { officeToday } from '@/lib/office-time'

// 2026-10-15 — the Finance revamp v2 (D12): one of the hub head's white
// buttons, ours kept beside the design's two; a refusal is the toast's.
export default function ExportCSVButton() {
  const [isPending, startTransition] = useTransition()

  function handleExport() {
    if (isPending) return
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
        flash(err instanceof Error ? err.message : 'Export failed')
      }
    })
  }

  return <HeadButton onClick={handleExport}>{isPending ? 'Exporting…' : 'Export CSV'}</HeadButton>
}
