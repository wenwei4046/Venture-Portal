'use client'

import { Fragment, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { AGING_BUCKETS, type AgingColumn } from '@/lib/debtor-aging'

// Master-detail aging matrix: one collapsible row per customer with per-bucket
// totals; expand to see each unpaid invoice with its amount in the matching
// aging column (matches the classic accounting-software creditor/debtor aging).

/** One customer's row and one invoice, in whichever bucket scheme the page uses. */
interface PayerRow {
  payer: string
  buckets: Record<string, number>
  total: number
  count: number
}
interface InvoiceRow {
  id: string
  invoiceNo: string
  payer: string
  invoiceDate: string | null
  description?: string | null
  amount: number
  bucket: string
}

interface Props {
  byPayer: PayerRow[]
  invoices: InvoiceRow[]
  totals: { buckets: Record<string, number>; total: number; count: number }
  /** The aging columns — months (the default) or Finance's days (2026-10-09). */
  columns?: readonly AgingColumn[]
  /** A Find company box that highlights the matching customers, nothing hidden (2026-10-09). */
  search?: boolean
  /** Close on the handoff's navy "All companies" row (2026-10-09, Finance's view). */
  allRow?: boolean
  /** The handoff's sheet (2026-10-10, Finance's view): bare figures, white rows. */
  sheet?: boolean
  /** As at a month on the control row (2026-10-10): the month shown and the
   *  choices; picking one reloads the page with ?as_at=. */
  asAt?: { value: string; options: Array<{ value: string; label: string }> }
  /** A line under the control row (what an As at reads). */
  note?: string
  /** Shown instead of the table when nothing is outstanding. */
  empty?: string
}

function money(v: number, bare = false) {
  return v ? <span className="num">{bare ? formatMoneyBare(v) : formatMoney(v)}</span> : <span className="num text-muted">—</span>
}

export default function AgingByCustomer({ byPayer, invoices, totals, allRow = false, columns = AGING_BUCKETS, search = false, sheet = false, asAt, note, empty }: Props) {
  const amount = (v: number) => (sheet ? formatMoneyBare(v) : formatMoney(v))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [find, setFind] = useState('')
  const needle = find.trim().toLowerCase()
  const hits = needle ? new Set(byPayer.filter((p) => p.payer.toLowerCase().includes(needle)).map((p) => p.payer)) : new Set<string>()

  const invoicesByPayer = useMemo(() => {
    const m = new Map<string, InvoiceRow[]>()
    for (const inv of invoices) {
      const arr = m.get(inv.payer) ?? []
      arr.push(inv)
      m.set(inv.payer, arr)
    }
    return m
  }, [invoices])

  function toggle(payer: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(payer)) next.delete(payer)
      else next.add(payer)
      return next
    })
  }

  return (
    <div>
      {search ? (
        // The handoff's control row (2026-10-10): Find company highlights only.
        <div className="rpt-toolbar" role="group" aria-label="Report controls">
          {asAt ? (
            // A plain GET form: picking a month reloads the page as at it.
            <form method="get" className="rpt-field">
              <span>As at</span>
              <select name="as_at" aria-label="As at" defaultValue={asAt.value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                {asAt.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </form>
          ) : null}
          <div className="rpt-field rpt-find">
            <span>
              Find company <span className="rpt-find-hint">· highlights only</span>
            </span>
            <div className="rpt-find-box">
              <input
                type="search"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setFind('')
                }}
                placeholder="Company…"
                aria-label="Find company"
                className="search-plain"
              />
              {needle ? <small>{hits.size === 0 ? 'No match' : `${hits.size} ${hits.size === 1 ? 'match' : 'matches'}`}</small> : null}
            </div>
          </div>
        </div>
      ) : null}
      {note ? <p className="rpt-cons">{note}</p> : null}
      {empty ? (
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-sm">{empty}</p>
        </div>
      ) : (
      <>
      <div className="mb-2 flex gap-3">
        <button
          onClick={() => setExpanded(new Set(byPayer.map((p) => p.payer)))}
          className="text-xs font-sans text-accent hover:underline"
        >
          Expand all
        </button>
        <button
          onClick={() => setExpanded(new Set())}
          className="text-xs font-sans text-muted hover:text-ink hover:underline"
        >
          Collapse all
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Customer</th>
              {columns.map((b) => (
                <th key={b.key} className="num">{b.label}</th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {byPayer.map((p) => {
              const isOpen = expanded.has(p.payer)
              const rows = invoicesByPayer.get(p.payer) ?? []
              return (
                <Fragment key={p.payer}>
                  <tr
                    className={`cursor-pointer ${sheet ? 'hover:bg-surface-2' : 'bg-surface-2 hover:bg-surface'}${hits.has(p.payer) ? ' search-row-hit' : ''}`}
                    onClick={() => toggle(p.payer)}
                  >
                    <td className="font-sans font-medium text-ink whitespace-nowrap">
                      <span className="inline-block w-4 text-muted">{isOpen ? '▼' : '▶'}</span>
                      {p.payer} <span className="text-muted text-xs font-normal">· {p.count}</span>
                    </td>
                    {columns.map((b) => (
                      <td key={b.key} className="num">{money(p.buckets[b.key] ?? 0, sheet)}</td>
                    ))}
                    <td className="num font-semibold">{amount(p.total)}</td>
                  </tr>
                  {isOpen &&
                    rows.map((inv) => (
                      <tr key={inv.id} className="text-xs">
                        <td>
                          <span className="inline-block w-4" />
                          <a
                            href={`/billing/invoice-doc?id=${inv.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-accent hover:underline"
                            title="Open invoice PDF"
                          >
                            {inv.invoiceNo}
                          </a>
                          <span className="text-muted ml-2 font-mono">
                            {inv.invoiceDate ? dayjs(inv.invoiceDate).format('DD/MM/YY') : '—'}
                          </span>
                          {inv.description ? (
                            <span className="text-graphite ml-2">{inv.description}</span>
                          ) : null}
                        </td>
                        {columns.map((b) => (
                          <td key={b.key} className="num">
                            {inv.bucket === b.key ? (
                              amount(inv.amount)
                            ) : (
                              <span className="text-muted">·</span>
                            )}
                          </td>
                        ))}
                        <td className="num">{amount(inv.amount)}</td>
                      </tr>
                    ))}
                </Fragment>
              )
            })}
            <tr className={allRow ? 'rpt-all' : 'border-t-2 border-hairline bg-surface-2 font-semibold'}>
              <td className={allRow ? undefined : 'font-serif italic text-ink'}>
                {allRow ? 'All companies' : 'Total'} <span className={allRow ? 'text-xs font-normal' : 'text-muted text-xs'}>· {totals.count}</span>
              </td>
              {columns.map((b) => (
                <td key={b.key} className="num">{money(totals.buckets[b.key] ?? 0, sheet)}</td>
              ))}
              <td className="num text-num-ink">{amount(totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  )
}
