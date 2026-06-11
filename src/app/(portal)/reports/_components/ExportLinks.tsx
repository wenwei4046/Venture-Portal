import Link from 'next/link'

/** Excel / PDF export links for the GL-driven statements — forwards the
 *  current period / compare / segment selection to the export route. */
export default function ExportLinks({
  basePath,
  period,
  compare,
  segment,
}: {
  basePath: string
  period: string
  compare: string
  segment: string
}) {
  const qs = (format: string) => {
    const p = new URLSearchParams({ format, period })
    if (compare) p.set('compare', compare)
    if (segment) p.set('segment', segment)
    return `${basePath}?${p.toString()}`
  }
  const cls =
    'px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors'
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
