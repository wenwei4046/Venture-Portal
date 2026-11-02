'use client'

import { useState } from 'react'
import dayjs from 'dayjs'
import { DialogMenu, FinDialog, type DialogMenuItem } from '@/components/finv/Dialog'

// The Repayment Schedule's Export (2026-11-02, the user: "一个export 就行" — A
// on its sample): one Export ▾ on the tabs' row opening the kit's menu, as
// Invoice's does — Excel, the month's two due tables as a spreadsheet, or PDF,
// the same two tables to print (it was a typewriter-face link to the
// spreadsheet only: "没有办法export pdf？"). Only for Treasury · Export, which
// its route asks — the page asks and says so (`canExport`).
export default function ExportMenu({ month, canExport }: { month: string; canExport: boolean }) {
  const [open, setOpen] = useState(false)
  if (!canExport) return null
  const href = (format: 'xlsx' | 'pdf') => `/repayment-schedule/export?month=${month}&format=${format}`
  const item = (key: 'xlsx' | 'pdf', label: string, sub: string, go: () => void): DialogMenuItem => ({
    key,
    label,
    sub,
    onClick: () => {
      setOpen(false)
      go()
    },
  })
  const items = [
    item('xlsx', 'Excel', `repayment-schedule-${month}.xlsx`, () => window.location.assign(href('xlsx'))),
    item('pdf', 'PDF', 'The same two tables, one PDF to print', () => window.open(href('pdf'), '_blank', 'noopener,noreferrer')),
  ]

  return (
    <>
      <button type="button" className="sch-tool-btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Export
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <FinDialog open={open} onClose={() => setOpen(false)} title="Export" sub={dayjs(`${month}-01`).format('MMMM YYYY')}>
        <DialogMenu items={items} />
      </FinDialog>
    </>
  )
}
