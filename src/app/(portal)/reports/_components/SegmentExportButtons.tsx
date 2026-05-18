'use client'

import { useSearchParams } from 'next/navigation'

export function SegmentExportButtons({
  basePath,
  from,
  to,
}: {
  basePath: string // e.g. '/reports/income-statement/export'
  from: string
  to: string
}) {
  const seg = useSearchParams().get('seg') ?? 'summary'
  const href = (format: 'xlsx' | 'pdf') =>
    `${basePath}?format=${format}&from=${from}&to=${to}&seg=${encodeURIComponent(seg)}`
  const cls =
    'px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors'
  return (
    <>
      <a href={href('xlsx')} className={cls}>Export Excel</a>
      <a href={href('pdf')} className={cls}>Export PDF</a>
    </>
  )
}
