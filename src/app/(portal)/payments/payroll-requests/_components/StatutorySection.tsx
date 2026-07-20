'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import dayjs from 'dayjs'
import { generateStatutoryVouchers } from '../actions'

interface Bank {
  id: string
  bank_name: string
  current_balance: number
}

export interface StatutoryPeriod {
  period_month: string
  /** Existing non-voided statutory PVs for this period's run. */
  pvs: { id: string; voucher_no: string | null; payee_name: string | null; amount: number; status: string }[]
}

interface Props {
  periods: StatutoryPeriod[]
  banks: Bank[]
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Mig 20260720 — one-click KWSP / PERKESO / LHDN / SKBBK vouchers per funded
 * payroll period, split per staff department pool. payment_date is left empty
 * on purpose (payment timing is uncertain) — Finance sets it on the pending PV
 * before Principal approves.
 */
export default function StatutorySection({ periods, banks }: Props) {
  const [bankId, setBankId] = useState<string>(banks[0]?.id ?? '')
  const [busyPeriod, setBusyPeriod] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (periods.length === 0) return null

  function handleGenerate(period: string) {
    setError(null)
    setBusyPeriod(period)
    startTransition(async () => {
      try {
        await generateStatutoryVouchers(period, bankId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generate failed')
      } finally {
        setBusyPeriod(null)
      }
    })
  }

  return (
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif text-2xl text-ink">Statutory payments</h2>
        <span className="font-mono text-xs text-muted">KWSP · PERKESO · LHDN · SKBBK</span>
      </div>
      <div className="border border-hairline rounded-md bg-surface divide-y divide-hairline">
        {periods.map(p => {
          const generated = p.pvs.length > 0
          return (
            <div key={p.period_month} className="px-5 py-4">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-serif text-md text-ink">
                    {dayjs(p.period_month).format('MMMM YYYY')} payroll
                  </div>
                  <div className="font-serif italic text-graphite text-sm mt-0.5">
                    {generated
                      ? 'Statutory vouchers generated — set the payment date on each PV before approval.'
                      : 'Split per staff department pool; payment date left blank for you to set.'}
                  </div>
                </div>
                {generated ? null : (
                  <div className="flex items-center gap-3 shrink-0">
                    <select
                      value={bankId}
                      onChange={e => setBankId(e.target.value)}
                      disabled={isPending}
                      className="bg-paper border border-hairline rounded-md px-2 py-1 text-xs font-sans text-ink focus:outline-none focus:border-accent-border"
                    >
                      {banks.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.bank_name} · RM {fmt(b.current_balance)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleGenerate(p.period_month)}
                      disabled={isPending || !bankId}
                      className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-1.5 rounded-md disabled:opacity-50 transition-colors"
                    >
                      {isPending && busyPeriod === p.period_month
                        ? 'Generating…'
                        : 'Generate statutory PVs →'}
                    </button>
                  </div>
                )}
              </div>
              {generated ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {p.pvs.map(v => (
                    <Link
                      key={v.id}
                      href={`/payments/${v.id}`}
                      className="font-mono text-xs text-accent hover:text-accent-hover"
                    >
                      {v.voucher_no ?? 'PV'} · {v.payee_name ?? '—'} · RM {fmt(v.amount)}
                      {v.status === 'paid' ? ' ✓' : ''} →
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {error ? <div className="font-serif italic text-danger text-xs mt-2">{error}</div> : null}
    </section>
  )
}
