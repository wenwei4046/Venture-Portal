'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  generateStatutoryScheme,
  setPayrollPvDate,
  type StatutoryScheme,
} from '../actions'

export interface StatutoryRow {
  scheme: StatutoryScheme
  /** Payee shown on the voucher, e.g. "PERKESO (SOCSO)". */
  payee: string
  staff: number
  directors: number
  /** Existing non-voided voucher for this scheme, if generated. */
  pv: {
    id: string
    voucher_no: string | null
    status: string
    payment_date: string | null
  } | null
}

interface Props {
  period: string
  rows: StatutoryRow[]
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Mig 20260721000000 — one row per statutory body (KWSP / SOCSO / EIS / PCB /
 * SKBBK), each generated, dated, approved and PAID separately. Dates are HR's
 * to set (blank = decide later; editable while the voucher is pending).
 */
export default function StatutoryTable({ period, rows }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map(r => [r.scheme, r.pv?.payment_date ?? ''])),
  )
  const [error, setError] = useState<string | null>(null)

  function run(scheme: StatutoryScheme, fn: () => Promise<void>) {
    setError(null)
    setBusy(scheme)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Institution</th>
              <th className="right">Staff</th>
              <th className="right">Directors</th>
              <th className="right">Total</th>
              <th>Payment date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const total = r.staff + r.directors
              const date = dates[r.scheme] ?? ''
              const pvPending = r.pv?.status === 'pending_approval'
              const pvPaid = r.pv?.status === 'paid' || r.pv?.status === 'approved'
              return (
                <tr key={r.scheme}>
                  <td>
                    <div className="font-serif text-md text-ink">{r.payee}</div>
                    {r.pv ? (
                      <Link
                        href={`/payments/${r.pv.id}`}
                        className="font-mono text-[11px] text-accent hover:text-accent-hover"
                      >
                        {r.pv.voucher_no ?? 'PV'}
                        {pvPaid ? ' · paid ✓' : ' · pending'}
                        {' →'}
                      </Link>
                    ) : null}
                  </td>
                  <td className="num text-graphite">{fmt(r.staff)}</td>
                  <td className="num text-graphite">{fmt(r.directors)}</td>
                  <td className="num">{fmt(total)}</td>
                  <td>
                    {pvPaid ? (
                      <span className="font-mono text-xs text-graphite">
                        {r.pv?.payment_date ?? '—'}
                      </span>
                    ) : (
                      <input
                        type="date"
                        value={date}
                        onChange={e =>
                          setDates(prev => ({ ...prev, [r.scheme]: e.target.value }))
                        }
                        disabled={isPending}
                        className="bg-paper border border-hairline rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none focus:border-accent-border"
                      />
                    )}
                  </td>
                  <td className="text-right">
                    {r.pv == null ? (
                      total > 0 ? (
                        <button
                          onClick={() =>
                            run(r.scheme, () =>
                              generateStatutoryScheme(period, r.scheme, date || undefined),
                            )
                          }
                          disabled={isPending}
                          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                        >
                          {busy === r.scheme ? 'Generating…' : 'Generate PV'}
                        </button>
                      ) : (
                        <span className="font-serif italic text-muted text-xs">—</span>
                      )
                    ) : pvPending ? (
                      <button
                        onClick={() =>
                          run(r.scheme, () => setPayrollPvDate(r.pv!.id, date))
                        }
                        disabled={isPending || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
                        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                      >
                        {busy === r.scheme ? 'Saving…' : 'Save date'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="font-serif italic text-muted text-xs mt-2">
        Each institution is paid separately from the Alliance payroll account —
        generate when ready, date it when you know the payment day (editable
        until Principal approves).
      </p>
      {error ? <div className="font-serif italic text-danger text-xs mt-1">{error}</div> : null}
    </div>
  )
}
