'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import {
  validateAllocationRows,
  hvRemainderPct,
  allocationPreview,
  type AllocationRow,
  type SplitLock,
} from '@/lib/staff-allocation'
import { saveStaffAllocation } from '../actions'
import { Select } from '@/components/hrv/select'

export interface StaffAllocationData {
  staffId: string
  name: string
  dept: string
  /** gross + EPF/SOCSO/EIS ER for the period — the billing basis. */
  employerCost: number
  rows: Array<{ companyId: string; pct: number }>
  /** Where their pay stands; past draft the split is locked with it. */
  lock: SplitLock
  /**
   * Their department bills by invoice (2026-09-30). Only listed while a split
   * is left over from before — frozen, and clearable while their pay is a draft.
   */
  centralized: boolean
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
  readOnly: boolean
}

interface EditRow {
  uid: string
  companyId: string
  pct: string // keep as text while typing
}

function toEditRows(rows: Array<{ companyId: string; pct: number }>): EditRow[] {
  return rows.map((r) => ({
    uid: crypto.randomUUID(),
    companyId: r.companyId,
    pct: String(r.pct),
  }))
}

function toAllocationRows(rows: EditRow[]): AllocationRow[] {
  return rows
    .filter((r) => r.companyId !== '' || r.pct.trim() !== '')
    .map((r) => ({ companyId: r.companyId, pct: Number(r.pct) }))
}

export default function AllocationEditor({ period, staff, companies, readOnly }: Props) {
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
        {staff.map((s) => (
          <StaffCard
            // A card that locks (or opens) starts again from what is saved,
            // so a refused edit never stays on screen as if it had landed.
            key={`${s.staffId}:${s.lock.locked ? 'locked' : 'open'}`}
            period={period}
            staff={s}
            companies={companies}
            readOnly={readOnly}
          />
        ))}
      </div>
    </section>
  )
}

function StaffCard({
  period,
  staff,
  companies,
  readOnly,
}: {
  period: string
  staff: StaffAllocationData
  companies: Company[]
  readOnly: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<EditRow[]>(() => toEditRows(staff.rows))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)
  // What is saved, in any order. When a refresh brings a different split —
  // Copy from last month, a save in another tab — a card nobody is editing
  // takes it; the form was only ever seeded on the first render.
  const savedKey = staff.rows.map((r) => `${r.companyId}=${r.pct}`).sort().join('|')
  const [shownKey, setShownKey] = useState(savedKey)
  if (savedKey !== shownKey) {
    setShownKey(savedKey)
    if (!dirty) setRows(toEditRows(staff.rows))
  }
  // The split follows the payroll row: past draft it stays as it left. A
  // centralized department's person is only here for a split left over from
  // before — never edited, only cleared.
  const locked = staff.lock.locked
  const frozen = readOnly || locked || staff.centralized

  const parsed = toAllocationRows(rows)
  const parseable = parsed.every((r) => r.companyId && Number.isFinite(r.pct))
  const check = parseable ? validateAllocationRows(parsed) : null
  const preview = parseable && check?.ok ? allocationPreview(staff.employerCost, parsed) : null
  const remainder = parseable ? hvRemainderPct(parsed) : null

  function patchRow(uid: string, patch: Partial<EditRow>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
    setDirty(true)
    setSavedNote(false)
  }
  function addRow() {
    setRows((prev) => [...prev, { uid: crypto.randomUUID(), companyId: '', pct: '' }])
    setDirty(true)
    setSavedNote(false)
  }
  function removeRow(uid: string) {
    setRows((prev) => prev.filter((r) => r.uid !== uid))
    setDirty(true)
    setSavedNote(false)
  }

  function save() {
    setError(null)
    if (!parseable) {
      setError('Every row needs a company and a numeric %')
      return
    }
    const v = validateAllocationRows(parsed)
    if (!v.ok) {
      setError(v.error)
      return
    }
    persist(parsed)
  }

  function persist(next: AllocationRow[]) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await saveStaffAllocation(staff.staffId, period, next)
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
              preview?.lines.find((l) => l.companyId === r.companyId)?.amount ?? null
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
                  disabled={frozen}
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
                    disabled={frozen}
                    className="w-24 px-3 py-1.5 bg-surface border border-hairline rounded-control text-sm font-mono text-ink text-right focus:outline-none focus:border-accent"
                    placeholder="0.00"
                  />
                  <span className="text-xs">%</span>
                </div>
                <span className="num text-sm min-w-[100px]">
                  {amt !== null ? formatMoney(amt) : '—'}
                </span>
                {!frozen && (
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

          {/* HOUZS Venture own share — always visible, auto = 100% − subsidiary
              rows. Not stored, not billed; Finance sees the same figure on the
              Billing page. */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 bg-surface-2 border border-dashed border-hairline rounded-control text-sm min-w-[180px]">
              HV — HOUZS Venture
            </div>
            <div className="flex items-center gap-1">
              <div className="w-24 px-3 py-1.5 bg-surface-2 border border-dashed border-hairline rounded-control text-sm font-mono text-right">
                {remainder !== null ? remainder.toFixed(2) : '—'}
              </div>
              <span className="text-xs">%</span>
            </div>
            <span className="num text-sm min-w-[100px]">
              {preview ? formatMoney(preview.hvAmount) : '—'}
            </span>
            <span className="text-[11px]">
              auto · own share · not billed
            </span>
          </div>
        </div>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-3 pt-3 border-t border-hairline">
        <div className="text-xs">
          {preview && (
            <>
              Billed to subsidiaries{' '}
              <span className="num text-ink font-bold">{formatMoney(preview.billedTotal)}</span>
            </>
          )}
          {error && <span className="text-danger ml-2">{error}</span>}
          {savedNote && !dirty && <span className="chip ledger ml-2"><span className="dot" />Saved.</span>}
        </div>
        {locked && (
          <p className="text-xs sm:text-right">
            {staff.lock.wayBack
              ? `Locked with their pay · ${staff.lock.wayBack} to change it`
              : 'Payroll for this month is closed for good'}
          </p>
        )}
        {staff.centralized && !locked && (
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
        {!frozen && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addRow}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-1.5 rounded-control transition-colors"
            >
              + Company
            </button>
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
