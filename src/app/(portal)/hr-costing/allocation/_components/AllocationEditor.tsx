'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import {
  validateDeptMoves,
  movePreview,
  type AllocationRow,
  type DeptMoveRow,
  type SplitLock,
} from '@/lib/staff-allocation'
import type { CostModel } from '@/lib/department-mode'
import { saveStaffAllocation } from '../actions'
import { Select } from '@/components/hrv/select'

export interface StaffAllocationData {
  staffId: string
  name: string
  dept: string
  /** Their own department — never a target of their own lines. */
  departmentId: string
  /** gross + EPF/SOCSO/EIS ER for the period — the billing basis. */
  employerCost: number
  rows: Array<{ companyId: string; pct: number }>
  /** Part of the cost to other departments (2026-11-03), as saved. */
  moves: DeptMoveRow[]
  /** Where their pay stands; past draft the split is locked with it. */
  lock: SplitLock
  /**
   * Their department bills by invoice (2026-09-30): no company split — one
   * left over from before is frozen and only cleared — but department lines
   * (2026-11-03), what they leave staying in their own department.
   */
  centralized: boolean
}

/** A department a line may name — from the registry (`department_modes()`). */
export interface MoveTarget {
  id: string
  name: string
  costModel: CostModel
  isInternal: boolean
  segmentKey: string | null
}

interface Company {
  id: string
  name: string
  short_code: string
}

interface Props {
  period: string
  staff: StaffAllocationData[]
  companies: Company[]
  departments?: MoveTarget[]
  readOnly: boolean
}

interface EditRow {
  uid: string
  companyId: string
  pct: string // keep as text while typing
}

interface EditMove {
  uid: string
  departmentId: string
  /** Unpicked until HR chooses Fixed RM or % — the box shows after. */
  kind: '' | DeptMoveRow['kind']
  value: string
}

function toEditRows(rows: Array<{ companyId: string; pct: number }>): EditRow[] {
  return rows.map((r) => ({
    uid: crypto.randomUUID(),
    companyId: r.companyId,
    pct: String(r.pct),
  }))
}

function toEditMoves(moves: DeptMoveRow[]): EditMove[] {
  return moves.map((m) => ({ uid: crypto.randomUUID(), departmentId: m.departmentId, kind: m.kind, value: String(m.value) }))
}

function toAllocationRows(rows: EditRow[]): AllocationRow[] {
  return rows
    .filter((r) => r.companyId !== '' || r.pct.trim() !== '')
    .map((r) => ({ companyId: r.companyId, pct: Number(r.pct) }))
}

function toDeptMoves(moves: EditMove[]): Array<DeptMoveRow | null> {
  return moves
    .filter((m) => m.departmentId !== '' || m.kind !== '' || m.value.trim() !== '')
    .map((m) => (m.departmentId && m.kind && m.value.trim() !== '' && Number.isFinite(Number(m.value))
      ? { departmentId: m.departmentId, kind: m.kind, value: Number(m.value) }
      : null))
}

const savedKeyOf = (s: StaffAllocationData) =>
  [
    ...s.rows.map((r) => `${r.companyId}=${r.pct}`),
    ...s.moves.map((m) => `${m.departmentId}:${m.kind}=${m.value}`),
  ].sort().join('|')

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function AllocationEditor({ period, staff, companies, departments = [], readOnly }: Props) {
  const costCenter = staff.filter((s) => !s.centralized)
  // Centralized departments' people, folded by department (2026-11-03): they
  // bill the companies by invoice, so only + Department is theirs.
  const bands = new Map<string, StaffAllocationData[]>()
  for (const s of staff.filter((p) => p.centralized)) bands.set(s.dept, [...(bands.get(s.dept) ?? []), s])

  const cardOf = (s: StaffAllocationData) => (
    <StaffCard
      // A card that locks (or opens) starts again from what is saved,
      // so a refused edit never stays on screen as if it had landed.
      key={`${s.staffId}:${s.lock.locked ? 'locked' : 'open'}`}
      period={period}
      staff={s}
      companies={companies}
      departments={departments}
      readOnly={readOnly}
    />
  )

  return (
    <section>
      <div className="sect-head">
        <h2>Staff Splits</h2>
        <span className="rule" aria-hidden />
        <span className="count">
          {staff.length} STAFF
        </span>
      </div>
      <div className="space-y-3">
        {costCenter.map(cardOf)}
        {[...bands].map(([dept, people]) => (
          <details
            key={dept}
            // Open while somebody in it moves cost, or has a split to clear.
            open={people.some((p) => p.moves.length > 0 || p.rows.length > 0) || undefined}
            className="border border-hairline rounded-card bg-surface-2"
          >
            <summary className="cursor-pointer px-5 py-3 text-sm font-bold flex items-baseline gap-3 flex-wrap">
              <span>{`${dept} · ${plural(people.length, 'person', 'people')}`}</span>
              <span className="chip"><span className="dot" />Centralized</span>
            </summary>
            <div className="space-y-3 px-3 pb-3">{people.map(cardOf)}</div>
          </details>
        ))}
      </div>
    </section>
  )
}

function StaffCard({
  period,
  staff,
  companies,
  departments,
  readOnly,
}: {
  period: string
  staff: StaffAllocationData
  companies: Company[]
  departments: MoveTarget[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<EditRow[]>(() => toEditRows(staff.rows))
  const [moves, setMoves] = useState<EditMove[]>(() => toEditMoves(staff.moves))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)
  // What is saved, in any order. When a refresh brings a different split —
  // Copy from last month, a save in another tab — a card nobody is editing
  // takes it; the form was only ever seeded on the first render.
  const savedKey = savedKeyOf(staff)
  const [shownKey, setShownKey] = useState(savedKey)
  if (savedKey !== shownKey) {
    setShownKey(savedKey)
    if (!dirty) {
      setRows(toEditRows(staff.rows))
      setMoves(toEditMoves(staff.moves))
    }
  }
  // The split follows the payroll row: past draft it stays as it left. A
  // centralized department's person has no company split — one left over
  // from before is only cleared, and until it is the card offers nothing else.
  const locked = staff.lock.locked
  const frozen = readOnly || locked
  const leftover = staff.centralized && staff.rows.length > 0
  const companiesFrozen = frozen || staff.centralized
  const movesFrozen = frozen || leftover

  const parsed = toAllocationRows(rows)
  const parsedMoves = toDeptMoves(moves)
  const parseable = parsed.every((r) => r.companyId && Number.isFinite(r.pct)) && parsedMoves.every((m) => m !== null)
  const cleanMoves = parsedMoves.filter((m): m is DeptMoveRow => m !== null)
  const check = parseable
    ? staff.centralized
      ? validateDeptMoves(staff.employerCost, [], cleanMoves, staff.departmentId, true)
      : validateDeptMoves(staff.employerCost, parsed, cleanMoves, staff.departmentId, false)
    : null
  const preview = parseable && check?.ok
    ? movePreview(staff.employerCost, staff.centralized ? [] : parsed, cleanMoves)
    : null
  const leftPct = preview && staff.employerCost > 0 ? (preview.hvAmount / staff.employerCost) * 100 : null

  // Never the person's own department, nor Venture Office, nor one with no pool.
  const targets = departments.filter((d) => d.id !== staff.departmentId && !d.isInternal && d.segmentKey)

  function touched() {
    setDirty(true)
    setSavedNote(false)
  }
  function patchRow(uid: string, patch: Partial<EditRow>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
    touched()
  }
  function addRow() {
    setRows((prev) => [...prev, { uid: crypto.randomUUID(), companyId: '', pct: '' }])
    touched()
  }
  function removeRow(uid: string) {
    setRows((prev) => prev.filter((r) => r.uid !== uid))
    touched()
  }
  function patchMove(uid: string, patch: Partial<EditMove>) {
    setMoves((prev) => prev.map((m) => (m.uid === uid ? { ...m, ...patch } : m)))
    touched()
  }
  function addMove() {
    setMoves((prev) => [...prev, { uid: crypto.randomUUID(), departmentId: '', kind: '', value: '' }])
    touched()
  }
  function removeMove(uid: string) {
    setMoves((prev) => prev.filter((m) => m.uid !== uid))
    touched()
  }

  function save() {
    setError(null)
    if (!parseable) {
      setError('Every row needs a company and a numeric %; every department line a department, Fixed RM or %, and a number')
      return
    }
    if (check && !check.ok) {
      setError(check.error)
      return
    }
    persist(staff.centralized ? [] : parsed, cleanMoves)
  }

  function persist(next: AllocationRow[], nextMoves?: DeptMoveRow[]) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await saveStaffAllocation(staff.staffId, period, next, ...(nextMoves ? [nextMoves] : []))
        if (!result.ok) {
          // Locked since this page was opened: say why, then show the card
          // as it now stands.
          setError(result.reason)
          router.refresh()
          return
        }
        setDirty(false)
        setSavedNote(true)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const usedCompanyIds = new Set(rows.map((r) => r.companyId).filter(Boolean))
  const usedDeptIds = new Set(moves.map((m) => m.departmentId).filter(Boolean))
  const leftLabel = staff.centralized ? `Stays in ${staff.dept}` : 'HV — HOUZS Venture'

  return (
    <div
      className="border border-hairline rounded-card bg-surface px-5 py-4"
      data-locked={locked || undefined}
    >
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-sm font-bold">{staff.name}</span>
          <span className="text-[11px]">{staff.dept}</span>
          <span className={staff.lock.tone === 'muted' ? 'chip' : `chip ${staff.lock.tone}`}>
            <span className="dot" />
            {staff.lock.label}
          </span>
        </div>
        <div className="text-xs">
          Employer cost <span className="num text-num-ink text-sm font-bold ml-1">{formatMoney(staff.employerCost)}</span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
          {rows.map((r) => {
            // Prefer the preview's line amount (it carries the last-line
            // rounding adjustment on a full 100% split); fall back to the
            // naive per-row figure while the form is mid-edit.
            const previewAmt =
              preview?.companies.find((l) => l.companyId === r.companyId)?.amount ?? null
            const amt =
              previewAmt ??
              (r.companyId && Number.isFinite(Number(r.pct)) && Number(r.pct) > 0
                ? Math.round(staff.employerCost * Number(r.pct)) / 100
                : null)
            return (
              <div key={r.uid} className="flex items-center gap-2 flex-wrap">
                <Select bare
                  value={r.companyId}
                  onChange={(e) => patchRow(r.uid, { companyId: e.target.value })}
                  disabled={companiesFrozen}
                  className="px-3 py-1.5 bg-surface border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent min-w-[180px]"
                >
                  <option value="">Company…</option>
                  {companies.map((c) => (
                    <option
                      key={c.id}
                      value={c.id}
                      disabled={c.id !== r.companyId && usedCompanyIds.has(c.id)}
                    >
                      {c.short_code} — {c.name}
                    </option>
                  ))}
                </Select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={r.pct}
                    onChange={(e) => patchRow(r.uid, { pct: e.target.value })}
                    disabled={companiesFrozen}
                    className="w-24 px-3 py-1.5 bg-surface border border-hairline rounded-control text-sm font-mono text-ink text-right focus:outline-none focus:border-accent"
                    placeholder="0.00"
                  />
                  <span className="text-xs">%</span>
                </div>
                <span className="num text-sm min-w-[100px]">
                  {amt !== null ? formatMoney(amt) : '—'}
                </span>
                {!companiesFrozen && (
                  <button
                    type="button"
                    onClick={() => removeRow(r.uid)}
                    aria-label="Remove row"
                    className="hover:text-danger text-sm px-1 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}

          {/* Part of the cost to another department (2026-11-03): the
              department first, then Fixed RM or % — the box shows after. */}
          {moves.map((m) => {
            const amount = preview?.moves.find((x) => x.departmentId === m.departmentId)
            const target = departments.find((d) => d.id === m.departmentId)
            return (
              <div key={m.uid} role="group" aria-label="Department line" className="flex items-center gap-2 flex-wrap">
                <Select bare
                  value={m.departmentId}
                  onChange={(e) => patchMove(m.uid, { departmentId: e.target.value })}
                  disabled={movesFrozen}
                  className="px-3 py-1.5 bg-accent-bg border border-accent-border rounded-control text-sm text-ink focus:outline-none focus:border-accent min-w-[180px]"
                >
                  <option value="">Department…</option>
                  {/* A saved line keeps its department listed even if it is no target now. */}
                  {target && !targets.includes(target) ? <option value={target.id}>{`→ ${target.name}`}</option> : null}
                  {targets.map((d) => (
                    <option key={d.id} value={d.id} disabled={d.id !== m.departmentId && usedDeptIds.has(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </Select>
                <div className="inline-flex border border-hairline rounded-control overflow-hidden" role="presentation">
                  {(['amount', 'pct'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={m.kind === k}
                      disabled={movesFrozen}
                      onClick={() => patchMove(m.uid, { kind: k })}
                      className={`text-xs px-2.5 py-1.5 transition-colors ${k === 'pct' ? 'border-l border-hairline' : ''} ${
                        m.kind === k ? 'bg-accent-bg text-ink font-bold' : 'bg-surface hover:bg-surface-2'
                      }`}
                    >
                      {k === 'amount' ? 'Fixed RM' : '%'}
                    </button>
                  ))}
                </div>
                {m.kind === '' ? (
                  <span className="text-[11px]">Pick Fixed RM or %</span>
                ) : (
                  <>
                    <div className="flex items-center gap-1">
                      {m.kind === 'amount' && <span className="text-xs">RM</span>}
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={m.kind === 'pct' ? 100 : undefined}
                        aria-label={m.kind === 'pct' ? 'Percentage' : 'Amount (RM)'}
                        value={m.value}
                        onChange={(e) => patchMove(m.uid, { value: e.target.value })}
                        disabled={movesFrozen}
                        className="w-28 px-3 py-1.5 bg-surface border border-hairline rounded-control text-sm font-mono text-ink text-right focus:outline-none focus:border-accent"
                        placeholder="0.00"
                      />
                      {m.kind === 'pct' && <span className="text-xs">%</span>}
                    </div>
                    <span className="num text-sm min-w-[100px]">
                      {amount
                        ? m.kind === 'pct'
                          ? `= ${formatMoney(amount.amount)}`
                          : `= ${amount.pct.toFixed(2)}% of the cost`
                        : '—'}
                    </span>
                  </>
                )}
                {!movesFrozen && (
                  <button
                    type="button"
                    onClick={() => removeMove(m.uid)}
                    aria-label="Remove line"
                    className="hover:text-danger text-sm px-1 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}

          {/* What is left — always visible, auto = the cost less the
              companies and the departments. HOUZS Venture's own share (not
              stored, not billed; Finance sees the same figure on the Billing
              page), or for a centralized person what stays in their own
              department's pool. */}
          <div role="group" aria-label={leftLabel} className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 bg-surface-2 border border-dashed border-hairline rounded-control text-sm min-w-[180px]">
              {leftLabel}
            </div>
            <div className="flex items-center gap-1">
              <div className="w-24 px-3 py-1.5 bg-surface-2 border border-dashed border-hairline rounded-control text-sm font-mono text-right">
                {leftPct !== null ? leftPct.toFixed(2) : '—'}
              </div>
              <span className="text-xs">%</span>
            </div>
            <span className="num text-sm min-w-[100px]">
              {preview ? formatMoney(preview.hvAmount) : '—'}
            </span>
            <span className="text-[11px]">
              {staff.centralized ? `auto · ${staff.dept}'s own pool` : 'auto · own share · not billed'}
            </span>
          </div>
        </div>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-3 pt-3 border-t border-hairline">
        <div className="text-xs">
          {preview && (
            <>
              {!staff.centralized && (
                <>
                  Billed to subsidiaries{' '}
                  <span className="num text-ink font-bold">{formatMoney(preview.billedTotal)}</span>
                </>
              )}
              {preview.moves.length > 0 && (
                <span>
                  {!staff.centralized && ' · '}To departments{' '}
                  <span className="num text-ink font-bold">{formatMoney(preview.movedTotal)}</span>
                </span>
              )}
            </>
          )}
          {error && <span className="text-danger ml-2">{error}</span>}
          {/* What is on screen breaks a rule — typed, or saved before the pay fell (the billing then lets the
              department lines give way, so the companies and departments never pass the cost). */}
          {!error && check && !check.ok && <span className="text-danger ml-2">{check.error}</span>}
          {savedNote && !dirty && <span className="chip ledger ml-2"><span className="dot" />Saved.</span>}
        </div>
        {locked && (
          <p className="text-xs sm:text-right">
            {staff.lock.wayBack
              ? `Locked with their pay · ${staff.lock.wayBack} to change it`
              : 'Payroll for this month is closed for good'}
          </p>
        )}
        {leftover && !locked && (
          <div className="flex items-center gap-3 flex-wrap sm:justify-end">
            <p className="text-xs sm:text-right m-0">
              {staff.dept} is centralized — billed by invoice, not split. This split is left from before.
            </p>
            {!readOnly && (
              <button
                type="button"
                onClick={() => persist([])}
                disabled={isPending}
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-1.5 rounded-control transition-colors disabled:opacity-40"
              >
                {isPending ? 'Clearing…' : 'Clear split'}
              </button>
            )}
          </div>
        )}
        {!movesFrozen && (
          <div className="flex items-center gap-2 flex-wrap">
            {!companiesFrozen && (
              <button
                type="button"
                onClick={addRow}
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-1.5 rounded-control transition-colors"
              >
                + Company
              </button>
            )}
            {targets.length > 0 && (
              <button
                type="button"
                onClick={addMove}
                className="bg-surface hover:bg-surface-2 border border-accent-border text-ink text-sm px-3 py-1.5 rounded-control transition-colors"
              >
                + Department
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={isPending || !dirty}
              className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-sm px-4 py-1.5 rounded-control transition-colors"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
