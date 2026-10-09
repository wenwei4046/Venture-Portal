import Link from 'next/link'

/** Excel / PDF export links for the GL-driven statements — forwards the
 *  current period / compare / segment selection to the export route. */
export default function ExportLinks({
  basePath,
  period,
  compare,
  segment,
  variant = 'default',
}: {
  basePath: string
  period: string
  compare: string
  segment: string
  /** 'sheet' (2026-10-09, the Finance revamp handoff): "Excel" / "PDF" as the sheet's quiet buttons. */
  variant?: 'default' | 'sheet'
}) {
  const qs = (format: string) => {
    const p = new URLSearchParams({ format, period })
    if (compare) p.set('compare', compare)
    if (segment) p.set('segment', segment)
    return `${basePath}?${p.toString()}`
  }
  const cls =
    'px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors'
  if (variant === 'sheet') {
    return (
      <>
        <a href={qs('xlsx')} className="btn-quiet-sheet">
          Excel
        </a>
        <a href={qs('pdf')} className="btn-quiet-sheet">
          PDF
        </a>
      </>
    )
  }
  return (
    <div className="shrink-0 flex items-center gap-2">
      <Link href={qs('xlsx')} className={cls}>
        Export Excel
      </Link>
      <Link href={qs('pdf')} className={cls}>
        Export PDF
      </Link>
    </div>
  )
}
