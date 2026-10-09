'use client'

import { Fragment, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import {
  AGING_BUCKETS,
  type AgingInvoice,
  type AgingPayerRow,
  type AgingBucket,
} from '@/lib/debtor-aging'

// Master-detail aging matrix: one collapsible row per customer with per-bucket
// totals; expand to see each unpaid invoice with its amount in the matching
// aging column (matches the classic accounting-software creditor/debtor aging).

interface Props {
  byPayer: AgingPayerRow[]
  invoices: AgingInvoice[]
  totals: { buckets: Record<AgingBucket, number>; total: number; count: number }
  /** Close on the handoff's navy "All companies" row (2026-10-09, Finance's view). */
  allRow?: boolean
}

function money(v: number) {
  return v ? <span className="num">{formatMoney(v)}</span> : <span className="num text-muted">—</span>
}

export default function AgingByCustomer({ byPayer, invoices, totals, allRow = false }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const invoicesByPayer = useMemo(() => {
    const m = new Map<string, AgingInvoice[]>()
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
              {AGING_BUCKETS.map((b) => (
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
                    className="cursor-pointer bg-surface-2 hover:bg-surface"
                    onClick={() => toggle(p.payer)}
                  >
                    <td className="font-sans font-medium text-ink whitespace-nowrap">
                      <span className="inline-block w-4 text-muted">{isOpen ? '▼' : '▶'}</span>
                      {p.payer} <span className="text-muted text-xs font-normal">· {p.count}</span>
                    </td>
                    {AGING_BUCKETS.map((b) => (
                      <td key={b.key} className="num">{money(p.buckets[b.key as AgingBucket])}</td>
                    ))}
                    <td className="num font-semibold">{formatMoney(p.total)}</td>
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
                        {AGING_BUCKETS.map((b) => (
                          <td key={b.key} className="num">
                            {inv.bucket === b.key ? (
                              formatMoney(inv.amount)
                            ) : (
                              <span className="text-muted">·</span>
                            )}
                          </td>
                        ))}
                        <td className="num">{formatMoney(inv.amount)}</td>
                      </tr>
                    ))}
                </Fragment>
              )
            })}
            <tr className={allRow ? 'rpt-all' : 'border-t-2 border-hairline bg-surface-2 font-semibold'}>
              <td className={allRow ? undefined : 'font-serif italic text-ink'}>
                {allRow ? 'All companies' : 'Total'} <span className={allRow ? 'text-xs font-normal' : 'text-muted text-xs'}>· {totals.count}</span>
              </td>
              {AGING_BUCKETS.map((b) => (
                <td key={b.key} className="num">{money(totals.buckets[b.key as AgingBucket])}</td>
              ))}
              <td className="num text-num-ink">{formatMoney(totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
