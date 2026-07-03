'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import {
  validateAllocationRows,
  hvRemainderPct,
  allocationPreview,
  type AllocationRow,
} from '@/lib/staff-allocation'
import { saveStaffAllocation } from '../actions'

export interface StaffAllocationData {
  staffId: string
  name: string
  dept: string
  /** gross + EPF/SOCSO/EIS ER for the period — the billing basis. */
  employerCost: number
  rows: Array<{ companyId: string; pct: number }>
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
            key={s.staffId}
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
    startTransition(async () => {
      try {
        await saveStaffAllocation(staff.staffId, period, parsed)
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
    <div className="border border-hairline rounded-md bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <span className="font-serif text-[15px] text-ink">{staff.name}</span>
          <span className="font-mono text-[11px] text-graphite ml-3">{staff.dept}</span>
        </div>
        <div className="font-mono text-xs text-muted">
          Employer cost <span className="num text-num-ink text-sm ml-1">{formatMoney(staff.employerCost)}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="font-serif italic text-muted text-sm mt-3">
          Not allocated — 100% stays with HV.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r) => {
            const amt =
              r.companyId && Number.isFinite(Number(r.pct)) && Number(r.pct) > 0
                ? Math.round(staff.employerCost * Number(r.pct)) / 100
                : null
            return (
              <div key={r.uid} className="flex items-center gap-2 flex-wrap">
                <select
                  value={r.companyId}
                  onChange={(e) => patchRow(r.uid, { companyId: e.target.value })}
                  disabled={readOnly}
                  className="px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border min-w-[180px]"
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
                </select>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={r.pct}
                    onChange={(e) => patchRow(r.uid, { pct: e.target.value })}
                    disabled={readOnly}
                    className="w-24 px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono text-ink text-right focus:outline-none focus:border-accent-border"
                    placeholder="0.00"
                  />
                  <span className="font-mono text-xs text-muted">%</span>
                </div>
                <span className="num text-sm text-graphite min-w-[100px]">
                  {amt !== null ? formatMoney(amt) : '—'}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeRow(r.uid)}
                    aria-label="Remove row"
                    className="text-muted hover:text-danger text-sm px-1 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap mt-3 pt-3 border-t border-hairline">
        <div className="font-mono text-xs text-muted">
          {remainder !== null && (
            <>
              HV keeps <span className="text-ink">{remainder.toFixed(2)}%</span>
              {preview && (
                <>
                  {' '}
                  (<span className="num">{formatMoney(preview.hvAmount)}</span>) · billed{' '}
                  <span className="num">{formatMoney(preview.billedTotal)}</span>
                </>
              )}
            </>
          )}
          {error && <span className="text-danger ml-2">{error}</span>}
          {savedNote && !dirty && <em className="font-serif italic text-ledger ml-2">Saved.</em>}
        </div>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addRow}
              className="bg-paper hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-1.5 rounded-md transition-colors"
            >
              + Company
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isPending || !dirty}
              className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-white font-serif italic text-sm px-4 py-1.5 rounded-md transition-colors"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
