'use client'

import { useMemo, useState, useTransition } from 'react'
import { generatePvFromRequest } from '../actions'
import { summariseRound, deptRemaining, type RoundLine } from '@/lib/payroll-funding'

interface Bank {
  id: string
  bank_name: string
  current_balance: number
}

export interface PoolBreakdownRow {
  pool_key: string
  dept_name: string
  required_amount: number
  pool_balance: number
  /** Already funded for this department across prior (non-voided) funding PVs. */
  committed: number
}

interface Props {
  requestId: string
  amount: number
  committedTotal: number
  banks: Bank[]
  breakdown: PoolBreakdownRow[]
  defaultDate: string
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function poolLabel(key: string): string {
  switch (key) {
    case 'dept_pool_hr':
      return 'HR Department Pool'
    case 'dept_pool_finance':
      return 'Finance Department Pool'
    case 'dept_pool_director_office':
      return 'Director Office Department Pool'
    case 'dept_pool_marketing':
      return 'Marketing Department Pool'
    case 'dept_pool_director':
      return 'Director Department Pool'
    default:
      return key
  }
}

export default function GeneratePvForm({
  requestId,
  amount,
  committedTotal,
  banks,
  breakdown,
  defaultDate,
}: Props) {
  const [bankId, setBankId] = useState<string>(banks[0]?.id ?? '')
  const [payDate, setPayDate] = useState<string>(defaultDate)
  // Default each department to what it still owes (required − already funded).
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      breakdown.map(row => [
        row.pool_key,
        deptRemaining({ required: row.required_amount, committed: row.committed }).toFixed(2),
      ]),
    ),
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const lines: RoundLine[] = useMemo(
    () =>
      breakdown.map(row => ({
        pool_key: row.pool_key,
        dept_name: row.dept_name,
        required: row.required_amount,
        pool_balance: row.pool_balance,
        committed: row.committed,
        input: Number(amounts[row.pool_key] ?? '0') || 0,
      })),
    [amounts, breakdown],
  )

  const summary = useMemo(
    () => summariseRound(lines, amount, committedTotal),
    [lines, amount, committedTotal],
  )

  const overdrawKeys = new Set(summary.overdrawRows.map(r => r.pool_key))
  const overCommitKeys = new Set(summary.overCommitRows.map(r => r.pool_key))

  const canSubmit = summary.canSubmit && !!bankId && /^\d{4}-\d{2}-\d{2}$/.test(payDate)

  function updateAmount(key: string, raw: string) {
    const clean = raw.replace(/[^\d.]/g, '')
    setAmounts(prev => ({ ...prev, [key]: clean }))
  }

  function handleGenerate() {
    setError(null)
    if (!bankId) {
      setError('Pick a source bank')
      return
    }
    const sources = lines
      .filter(r => r.input > 0)
      .map(r => ({ pool: r.pool_key, amount: Number(r.input.toFixed(2)) }))

    startTransition(async () => {
      try {
        await generatePvFromRequest(requestId, bankId, sources, payDate)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generate failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* ── Bank source + payment date ───────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-1.5 font-sans text-xs text-graphite">
          <span className="text-muted">from bank</span>
          <select
            value={bankId}
            onChange={e => setBankId(e.target.value)}
            disabled={isPending}
            className="bg-paper border border-hairline rounded-md px-2 py-1 text-xs font-sans text-ink focus:outline-none focus:border-accent-border"
          >
            {banks.length === 0 ? (
              <option value="">No active banks</option>
            ) : (
              banks.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bank_name} · RM {fmt(b.current_balance)}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="flex items-center gap-1.5 font-sans text-xs text-graphite">
          <span className="text-muted">date</span>
          <input
            type="date"
            value={payDate}
            onChange={e => setPayDate(e.target.value)}
            disabled={isPending}
            className="bg-paper border border-hairline rounded-md px-2 py-1 text-xs font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </label>
        <span className="font-serif italic text-muted text-xs">
          funding is an accrual — the bank isn&apos;t charged until staff are paid
        </span>
      </div>

      {/* ── By-department allocation ─────────────────────────────── */}
      <div className="border border-hairline rounded-md bg-paper overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-surface">
              <th className="text-left py-2 px-3 font-medium">Department Pool</th>
              <th className="text-right py-2 px-3 font-medium">Required</th>
              {committedTotal > 0.005 ? (
                <th className="text-right py-2 px-3 font-medium">Funded</th>
              ) : null}
              <th className="text-right py-2 px-3 font-medium">Balance</th>
              <th className="text-right py-2 px-3 font-medium">Fund now</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(row => {
              const remainingDept = deptRemaining(row)
              const done = remainingDept < 0.005
              const overdraw = overdrawKeys.has(row.pool_key)
              const overCommit = overCommitKeys.has(row.pool_key)
              return (
                <tr
                  key={row.pool_key}
                  className={'border-b border-hairline last:border-0 ' + (done ? 'opacity-60' : '')}
                >
                  <td className="py-2 px-3">
                    <div className="font-serif text-ink">{poolLabel(row.pool_key)}</div>
                    <div className="font-mono text-[10px] text-muted uppercase tracking-wider">
                      {row.dept_name}
                      {overdraw ? (
                        <span className="text-alert ml-1 normal-case tracking-normal">
                          · 预支 pool goes negative
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular text-graphite">
                    {fmt(row.required)}
                  </td>
                  {committedTotal > 0.005 ? (
                    <td className="py-2 px-3 text-right font-mono tabular text-ledger">
                      {fmt(row.committed)}
                    </td>
                  ) : null}
                  <td
                    className={
                      'py-2 px-3 text-right font-mono tabular ' +
                      (row.pool_balance < 0 ? 'text-danger' : 'text-graphite')
                    }
                  >
                    {fmt(row.pool_balance)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amounts[row.pool_key] ?? ''}
                      onChange={e => updateAmount(row.pool_key, e.target.value)}
                      disabled={isPending || done}
                      className={
                        'w-28 bg-paper border rounded-md px-2 py-1 text-right font-mono tabular text-sm text-ink ' +
                        'focus:outline-none focus:border-accent-border ' +
                        (overCommit ? 'border-danger' : overdraw ? 'border-alert' : 'border-hairline')
                      }
                    />
                  </td>
                </tr>
              )
            })}
            <tr className="bg-surface/40">
              <td className="py-2 px-3 font-serif italic text-accent">Funding now</td>
              <td className="py-2 px-3 text-right font-mono tabular text-muted">
                {fmt(amount)}
              </td>
              {committedTotal > 0.005 ? (
                <td className="py-2 px-3 text-right font-mono tabular text-ledger">
                  {fmt(committedTotal)}
                </td>
              ) : null}
              <td className="py-2 px-3"></td>
              <td className="py-2 px-3 text-right font-mono tabular font-semibold text-ink">
                {fmt(summary.sumInput)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Remainder + warnings + submit ────────────────────────── */}
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="font-mono text-xs text-muted">
          {summary.remainingAfter > 0.005 ? (
            <>
              After this: <span className="text-ink font-semibold">RM {fmt(summary.remainingAfter)}</span>{' '}
              still to fund (stays open — fund the rest later)
            </>
          ) : (
            <span className="text-ledger">This fully funds the payroll.</span>
          )}
        </div>
      </div>

      {summary.overCommitRows.length > 0 ? (
        <div className="font-serif italic text-danger text-xs">
          Can&apos;t fund more than a department still owes:{' '}
          {summary.overCommitRows.map(r => poolLabel(r.pool_key)).join(', ')}.
        </div>
      ) : null}
      {summary.sumInput > summary.remainingBefore + 0.005 ? (
        <div className="font-serif italic text-danger text-xs">
          This round (RM {fmt(summary.sumInput)}) exceeds the outstanding RM {fmt(summary.remainingBefore)}.
        </div>
      ) : null}
      {summary.overCommitRows.length === 0 && summary.overdrawRows.length > 0 ? (
        <div className="font-serif italic text-alert text-xs">
          {summary.overdrawRows.map(r => poolLabel(r.pool_key)).join(', ')} will go negative (预支) —
          allowed; the pool is topped up later by billing.
        </div>
      ) : null}
      {error ? <div className="font-serif italic text-danger text-xs">{error}</div> : null}

      <div className="flex items-center justify-end">
        <button
          onClick={handleGenerate}
          disabled={isPending || !canSubmit}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Generating…' : 'Generate PV →'}
        </button>
      </div>
    </div>
  )
}
