'use client'

import { useState } from 'react'
import { CloseButton, Window } from '@/components/hrv/overlay'
import { Select } from '@/components/hrv/select'
import { btn, hv as k } from '@/components/hrv/kit'
import { formatMoney } from '@/lib/utils'
import {
  checkHvSplit,
  leftFigure,
  parseFigure,
  switchMode,
  type HvDepartment,
  type HvDraftLine,
  type HvSplitMode,
} from '@/lib/director-hv-share'

/** What Confirm hands the grid's Save: the split as the database takes it. */
export interface HvSplitConfirm {
  mode: HvSplitMode
  lines: Array<{ departmentId: string; amount?: number; pct?: number }>
}

/**
 * Save on the Pool Breakdown while HOUZS Venture pays something (2026-10-13 —
 * the user: "once detech venture itself got pay, will need to select the
 * amount is deduct from which department … by amount or percentage from the
 * total amount. then confirm so that finance will get the submittion"). Every
 * department may pay ("make sure all department, can be seleceted"), as many
 * as HR likes; Confirm waits until the lines make the total to the sen (by
 * amount) or 100% (by percentage) — lib/director-hv-share, the database's own
 * arithmetic.
 */
export default function HvSplitWindow({
  total,
  periodLabel,
  departments,
  initialMode,
  initialLines,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  /** HOUZS Venture's total for the month: Basic + KPI + Allowance + employer statutory. */
  total: number
  /** "October 2026". */
  periodLabel: string
  departments: HvDepartment[]
  initialMode: HvSplitMode
  initialLines: HvDraftLine[]
  busy: boolean
  /** The database's refusal, in its words. */
  error: string | null
  onCancel: () => void
  onConfirm: (split: HvSplitConfirm) => void
}) {
  const [mode, setMode] = useState<HvSplitMode>(initialMode)
  const [lines, setLines] = useState<HvDraftLine[]>(initialLines)

  const nameOf = (id: string) => departments.find(d => d.id === id)?.name ?? '—'
  const check = checkHvSplit(total, mode, lines, nameOf)
  const allUsed = departments.every(d => lines.some(l => l.departmentId === d.id))

  const setLine = (i: number, patch: Partial<HvDraftLine>) =>
    setLines(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const close = () => {
    if (!busy) onCancel()
  }

  function changeMode(next: HvSplitMode) {
    if (next === mode) return
    setLines(prev => switchMode(total, mode, prev))
    setMode(next)
  }

  function confirm() {
    if (check.problem || busy) return
    onConfirm({
      mode,
      lines: lines.map(l =>
        mode === 'percent'
          ? { departmentId: l.departmentId, pct: parseFigure(l.value) }
          : { departmentId: l.departmentId, amount: parseFigure(l.value) },
      ),
    })
  }

  return (
    <Window open onClose={close} width={560} label="HOUZS Venture's share">
      <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-hairline">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em]">HOUZS Venture · {periodLabel}</div>
          <div className="mt-1 text-[17px] font-semibold">
            Deduct <span className="font-mono tabular">{formatMoney(total)}</span> from
          </div>
        </div>
        <CloseButton onClick={close} />
      </div>

      <div className="px-6 py-4 overflow-y-auto">
        <div className="flex gap-2 mb-4" role="group" aria-label="Split by">
          <button type="button" className={k.pill} aria-pressed={mode === 'amount'} onClick={() => changeMode('amount')}>
            By amount
          </button>
          <button type="button" className={k.pill} aria-pressed={mode === 'percent'} onClick={() => changeMode('percent')}>
            By %
          </button>
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                aria-label={`Department ${i + 1}`}
                value={l.departmentId}
                onChange={e => setLine(i, { departmentId: e.target.value })}
                className="flex-1 min-w-0"
              >
                <option value="">Pick a department</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id} disabled={d.id !== l.departmentId && lines.some(o => o.departmentId === d.id)}>
                    {d.name}
                  </option>
                ))}
              </Select>
              <div className="relative shrink-0">
                {mode === 'amount' ? (
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none">RM</span>
                ) : null}
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={mode === 'percent' ? `Percentage — ${nameOf(l.departmentId)}` : `Amount — ${nameOf(l.departmentId)}`}
                  value={l.value}
                  onChange={e => setLine(i, { value: e.target.value })}
                  placeholder={mode === 'percent' ? '0' : '0.00'}
                  className={`${k.input} font-mono tabular text-right ${mode === 'percent' ? 'w-24' : 'w-36'}`}
                  // The kit's input pads 10px all round; the RM / % mark needs its own room.
                  style={mode === 'percent' ? { paddingRight: 28 } : { paddingLeft: 38 }}
                />
                {mode === 'percent' ? (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none">%</span>
                ) : null}
              </div>
              {mode === 'percent' ? (
                <span className="w-28 shrink-0 text-right font-mono tabular text-[12px]" data-testid={`hv-line-amount-${i}`}>
                  {check.amounts[i] > 0 ? formatMoney(check.amounts[i]) : '—'}
                </span>
              ) : null}
              <button
                type="button"
                className={btn('outline')}
                style={{ padding: '6px 10px' }}
                aria-label={`Remove ${nameOf(l.departmentId)}`}
                disabled={lines.length === 1}
                onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          className={`${btn('dashed')} mt-3`}
          disabled={allUsed}
          onClick={() => setLines(prev => [...prev, { departmentId: '', value: leftFigure(total, mode, prev) }])}
        >
          + Add department
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-t border-hairline">
        <div className="flex-1 min-w-0 text-[12.5px]" role="status">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : check.problem ? (
            <span>{check.problem}</span>
          ) : (
            <span>
              <span className="font-mono tabular">{formatMoney(check.placed)}</span> · {lines.length} department{lines.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button type="button" className={btn('outline')} onClick={close} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={btn('primary')} onClick={confirm} disabled={busy || check.problem !== null}>
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </Window>
  )
}
