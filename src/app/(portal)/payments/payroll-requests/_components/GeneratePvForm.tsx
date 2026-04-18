'use client'

import { useMemo, useState, useTransition } from 'react'
import { generatePvFromRequest } from '../actions'

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
}

interface Props {
  requestId: string
  amount: number
  banks: Bank[]
  breakdown: PoolBreakdownRow[]
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function poolLabel(key: string): string {
  switch (key) {
    case 'hr_opex':
      return 'HR Department Pool'
    case 'finance_opex':
      return 'Finance Department Pool'
    case 'director_opex':
      return 'Director Office Department Pool'
    case 'dept_pool_marketing':
      return 'Marketing Department Pool'
    case 'dept_pool_director':
      return 'Director Department Pool'
    default:
      return key
  }
}

export default function GeneratePvForm({ requestId, amount, banks, breakdown }: Props) {
  const [bankId, setBankId] = useState<string>(banks[0]?.id ?? '')
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      breakdown.map(row => [row.pool_key, row.required_amount.toFixed(2)]),
    ),
  )
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const selectedBank = banks.find(b => b.id === bankId)
  const bankShort = selectedBank ? selectedBank.current_balance < amount : false

  const parsedAmounts = useMemo(
    () =>
      breakdown.map(row => ({
        ...row,
        input: Number(amounts[row.pool_key] ?? '0') || 0,
      })),
    [amounts, breakdown],
  )

  const sumAllocated = parsedAmounts.reduce((acc, r) => acc + r.input, 0)
  const sumGap = Math.round((sumAllocated - amount) * 100) / 100
  const shortRows = parsedAmounts.filter(r => r.input > r.pool_balance + 0.005)

  const canSubmit =
    !!bankId &&
    !bankShort &&
    shortRows.length === 0 &&
    Math.abs(sumGap) < 0.01 &&
    parsedAmounts.some(r => r.input > 0)

  function updateAmount(key: string, raw: string) {
    // Allow empty, digits, optional single dot
    const clean = raw.replace(/[^\d.]/g, '')
    setAmounts(prev => ({ ...prev, [key]: clean }))
  }

  function handleGenerate() {
    setError(null)
    if (!bankId) {
      setError('Pick a source bank')
      return
    }
    const sources = parsedAmounts
      .filter(r => r.input > 0)
      .map(r => ({ pool: r.pool_key, amount: Number(r.input.toFixed(2)) }))

    startTransition(async () => {
      try {
        await generatePvFromRequest(requestId, bankId, sources)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generate failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
      }
    })
  }

  return (
    <div className="space-y-3">
      {/* ── Bank source ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
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
        {bankShort ? (
          <span className="font-serif italic text-danger text-xs">
            Bank short of RM {fmt(amount)}
          </span>
        ) : null}
      </div>

      {/* ── By-department pool breakdown ─────────────────────────── */}
      <div className="border border-hairline rounded-md bg-paper overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-surface">
              <th className="text-left py-2 px-3 font-medium">Department Pool</th>
              <th className="text-right py-2 px-3 font-medium">Required</th>
              <th className="text-right py-2 px-3 font-medium">Balance</th>
              <th className="text-right py-2 px-3 font-medium">Allocate</th>
            </tr>
          </thead>
          <tbody>
            {parsedAmounts.map(row => {
              const short = row.input > row.pool_balance + 0.005
              const required = row.required_amount
              const zeroRequired = required < 0.01
              return (
                <tr
                  key={row.pool_key}
                  className={
                    'border-b border-hairline last:border-0 ' +
                    (zeroRequired ? 'opacity-60' : '')
                  }
                >
                  <td className="py-2 px-3">
                    <div className="font-serif text-ink">{poolLabel(row.pool_key)}</div>
                    <div className="font-mono text-[10px] text-muted uppercase tracking-wider">
                      {row.dept_name}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular text-graphite">
                    {fmt(required)}
                  </td>
                  <td
                    className={
                      'py-2 px-3 text-right font-mono tabular ' +
                      (row.pool_balance < required ? 'text-danger' : 'text-graphite')
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
                      disabled={isPending || zeroRequired}
                      className={
                        'w-28 bg-paper border rounded-md px-2 py-1 text-right font-mono tabular text-sm text-ink ' +
                        'focus:outline-none focus:border-accent-border ' +
                        (short ? 'border-danger' : 'border-hairline')
                      }
                    />
                  </td>
                </tr>
              )
            })}
            <tr className="bg-surface/40">
              <td className="py-2 px-3 font-serif italic text-accent">Allocated</td>
              <td className="py-2 px-3 text-right font-mono tabular font-semibold text-ink">
                {fmt(amount)}
              </td>
              <td className="py-2 px-3"></td>
              <td
                className={
                  'py-2 px-3 text-right font-mono tabular font-semibold ' +
                  (Math.abs(sumGap) < 0.01 ? 'text-ink' : 'text-danger')
                }
              >
                {fmt(sumAllocated)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Warnings + Submit ────────────────────────────────────── */}
      {shortRows.length > 0 ? (
        <div className="font-serif italic text-danger text-xs">
          Insufficient balance:{' '}
          {shortRows.map(r => poolLabel(r.pool_key)).join(', ')}. Top up before generating.
        </div>
      ) : null}
      {Math.abs(sumGap) >= 0.01 ? (
        <div className="font-serif italic text-alert text-xs">
          Allocated total (RM {fmt(sumAllocated)}) must match the payroll total (RM {fmt(amount)}).{' '}
          {sumGap > 0 ? `Over by RM ${fmt(sumGap)}.` : `Short by RM ${fmt(-sumGap)}.`}
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
