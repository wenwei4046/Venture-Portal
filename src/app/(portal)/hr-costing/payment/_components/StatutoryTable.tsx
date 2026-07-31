'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  generateStatutoryScheme,
  generateStatutoryDirectorTopup,
  setPayrollPvDate,
  type StatutoryScheme,
} from '../actions'

interface StatutoryPv {
  id: string
  voucher_no: string | null
  status: string
  payment_date: string | null
}

export interface StatutoryRow {
  scheme: StatutoryScheme
  /** Payee shown on the voucher, e.g. "PERKESO (SOCSO)". */
  payee: string
  staff: number
  directors: number
  /** Existing non-voided voucher for this scheme, if generated. */
  pv: StatutoryPv | null
  /** Director-only top-up voucher (mig 20260731050000), if raised. */
  topupPv: StatutoryPv | null
  /** True when the director share is already on SOME voucher (combined or
   *  top-up) — hides the top-up button. */
  directorsCovered: boolean
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
    Object.fromEntries(
      rows.flatMap(r => [
        [r.scheme, r.pv?.payment_date ?? ''],
        // Separate date slot for the director top-up voucher.
        [`${r.scheme}:dir`, r.topupPv?.payment_date ?? ''],
      ]),
    ),
  )
  const [error, setError] = useState<string | null>(null)

  // Busy key: the scheme, or `${scheme}-dir` for its director top-up actions.
  function run(scheme: string, fn: () => Promise<void>) {
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
              const dirDate = dates[`${r.scheme}:dir`] ?? ''
              const pvPending = r.pv?.status === 'pending_approval'
              const pvPaid = r.pv?.status === 'paid' || r.pv?.status === 'approved'
              const topupPending = r.topupPv?.status === 'pending_approval'
              const topupPaid = r.topupPv?.status === 'paid' || r.topupPv?.status === 'approved'
              // Offer the director top-up only when the main voucher exists but
              // carries no director share (Jun 2026: generated before the
              // director actuals arrived) and there is a share to pay.
              const offerTopup = r.pv != null && !r.directorsCovered && r.directors > 0
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
                    {r.topupPv ? (
                      <div>
                        <Link
                          href={`/payments/${r.topupPv.id}`}
                          className="font-mono text-[11px] text-accent hover:text-accent-hover"
                        >
                          {r.topupPv.voucher_no ?? 'PV'}
                          {' · directors'}
                          {topupPaid ? ' · paid ✓' : ' · pending'}
                          {' →'}
                        </Link>
                      </div>
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
                    {/* Second slot for the director top-up voucher's date. */}
                    {offerTopup || topupPending ? (
                      <div className="mt-1">
                        <input
                          type="date"
                          value={dirDate}
                          onChange={e =>
                            setDates(prev => ({ ...prev, [`${r.scheme}:dir`]: e.target.value }))
                          }
                          disabled={isPending}
                          title="Directors top-up payment date"
                          className="bg-paper border border-hairline rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none focus:border-accent-border"
                        />
                      </div>
                    ) : topupPaid ? (
                      <div className="mt-1 font-mono text-xs text-graphite">
                        {r.topupPv?.payment_date ?? '—'} <span className="text-muted">· dir</span>
                      </div>
                    ) : null}
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
                    {/* Director top-up: main voucher exists but carries no
                        director share — raise the second, director-only PV. */}
                    {offerTopup ? (
                      <div className="mt-1.5">
                        <button
                          onClick={() =>
                            run(`${r.scheme}-dir`, () =>
                              generateStatutoryDirectorTopup(period, r.scheme, dirDate || undefined),
                            )
                          }
                          disabled={isPending}
                          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                        >
                          {busy === `${r.scheme}-dir` ? 'Generating…' : 'Generate directors PV'}
                        </button>
                      </div>
                    ) : topupPending ? (
                      <div className="mt-1.5">
                        <button
                          onClick={() =>
                            run(`${r.scheme}-dir`, () => setPayrollPvDate(r.topupPv!.id, dirDate))
                          }
                          disabled={isPending || !/^\d{4}-\d{2}-\d{2}$/.test(dirDate)}
                          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                        >
                          {busy === `${r.scheme}-dir` ? 'Saving…' : 'Save dir date'}
                        </button>
                      </div>
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
