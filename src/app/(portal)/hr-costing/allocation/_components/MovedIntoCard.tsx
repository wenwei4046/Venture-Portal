'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import {
  HV_BILL_TO,
  billToPreview,
  validateAllocationRows,
  type AllocationComponents,
  type AllocationRow,
} from '@/lib/staff-allocation'
import { saveDeptBillTo } from '../actions'
import { Select } from '@/components/hrv/select'

// What moved into a cost-center department this month (2026-11-03, method B),
// and its Bill to %: the companies it bills that money on to. What it does not
// bill stays in its own pool (the user: "也有可能是 hr pool 要承担") — unless HOUZS Venture takes a share of it, a
// row of its own (2026-11-04, the user: "分进来的无法由hv 承担一部分？" → method 2). One card
// per receiving cost center with something moved in; editable until the
// payroll month is closed for good — the month's invoices take the % as it
// stands when Finance generates them, a later change goes through the
// reconciliation.

interface Company {
  id: string
  name: string
  short_code: string
}

export interface MovedIn {
  name: string
  fromDept: string
  amount: number
  parts: AllocationComponents
}

interface Props {
  period: string
  department: { id: string; name: string }
  incoming: MovedIn[]
  billTo: AllocationRow[]
  /** Last month's Bill to %, for Copy last month's %. */
  lastMonthBillTo: AllocationRow[]
  companies: Company[]
  readOnly: boolean
  /** The payroll month is closed for good. */
  locked: boolean
}

interface EditRow {
  uid: string
  companyId: string
  pct: string
}

const PART_LABEL: Array<[keyof AllocationComponents, string]> = [
  ['salary', 'Salary'],
  ['allowance', 'Allowance'],
  ['epf', 'EPF'],
  ['socso', 'SOCSO'],
  ['eis', 'EIS'],
]

/** HOUZS Venture's % in a Bill to, or blank. */
const hvOf = (list: AllocationRow[]) => {
  const hv = list.find((r) => r.companyId === HV_BILL_TO)
  return hv ? String(hv.pct) : ''
}

const toEditRows = (rows: AllocationRow[]): EditRow[] =>
  rows.filter((r) => r.companyId !== HV_BILL_TO).map((r) => ({ uid: crypto.randomUUID(), companyId: r.companyId, pct: String(r.pct) }))

export default function MovedIntoCard({ period, department, incoming, billTo, lastMonthBillTo, companies, readOnly, locked }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<EditRow[]>(() => toEditRows(billTo))
  const [hvPct, setHvPct] = useState(() => hvOf(billTo))
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)
  const savedKey = billTo.map((r) => `${r.companyId}=${r.pct}`).sort().join('|')
  const [shownKey, setShownKey] = useState(savedKey)
  if (savedKey !== shownKey) {
    setShownKey(savedKey)
    if (!dirty) {
      setRows(toEditRows(billTo))
      setHvPct(hvOf(billTo))
    }
  }
  const frozen = readOnly || locked

  const received = Math.round(incoming.reduce((s, m) => s + m.amount, 0) * 100) / 100
  const parsed = rows
    .filter((r) => r.companyId !== '' || r.pct.trim() !== '')
    .map((r) => ({ companyId: r.companyId, pct: Number(r.pct) }))
  if (hvPct.trim() !== '' && Number(hvPct) !== 0) parsed.push({ companyId: HV_BILL_TO, pct: Number(hvPct) })
  const parseable = parsed.every((r) => r.companyId && Number.isFinite(r.pct))
  const check = parseable ? validateAllocationRows(parsed) : null
  const preview = parseable && check?.ok ? billToPreview(received, parsed) : null
  const staysPct = preview && received > 0 ? (preview.stays / received) * 100 : null
  const billed = preview ? Math.round(preview.lines.filter((l) => l.companyId !== HV_BILL_TO).reduce((s, l) => s + l.amount, 0) * 100) / 100 : null
  const hvAmount = preview?.lines.find((l) => l.companyId === HV_BILL_TO)?.amount ?? null
  const staysLabel = `Stays in ${department.name}`

  function edit(next: (prev: EditRow[]) => EditRow[]) {
    setRows(next)
    setDirty(true)
    setSavedNote(false)
  }

  function save() {
    setError(null)
    if (!parseable) return setError('Every row needs a company and a numeric %')
    if (check && !check.ok) return setError(check.error)
    startTransition(async () => {
      try {
        const result = await saveDeptBillTo(department.id, period, parsed)
        if (!result.ok) {
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

  const used = new Set(rows.map((r) => r.companyId).filter(Boolean))
  const headingId = `moved-into-${department.id}`

  return (
    <section aria-labelledby={headingId} className="border border-hairline rounded-card bg-surface px-5 py-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h3 id={headingId} className="text-sm font-bold m-0">{`Moved into ${department.name}`}</h3>
          <span className="chip"><span className="dot" />{`${department.name} pool`}</span>
        </div>
        <div className="text-xs">
          Received <span data-testid="received" className="num text-num-ink text-sm font-bold ml-1">{formatMoney(received)}</span>
        </div>
      </div>

      <ul className="mt-3 border border-hairline rounded-control divide-y divide-hairline list-none p-0 m-0">
        {incoming.map((m, i) => (
          <li key={`${m.name}:${i}`} className="px-3 py-2">
            <div className="flex items-baseline justify-between gap-3 flex-wrap text-sm">
              <span>{`${m.name} · ${m.fromDept}`}</span>
              <span className="num">{formatMoney(m.amount)}</span>
            </div>
            <div className="text-[11px] mt-0.5">
              {PART_LABEL.filter(([k]) => m.parts[k] !== 0).map(([k, label]) => `${label} ${formatMoneyBare(m.parts[k])}`).join(' · ')}
            </div>
          </li>
        ))}
      </ul>

      <div className="text-xs font-bold mt-3">Bill to</div>
      <div className="mt-2 space-y-2">
        {rows.map((r) => {
          const amt = preview?.lines.find((l) => l.companyId === r.companyId)?.amount ?? null
          return (
            <div key={r.uid} className="flex items-center gap-2 flex-wrap">
              <Select bare
                value={r.companyId}
                onChange={(e) => edit((prev) => prev.map((x) => (x.uid === r.uid ? { ...x, companyId: e.target.value } : x)))}
                disabled={frozen}
                className="px-3 py-1.5 bg-surface border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent min-w-[180px]"
              >
                <option value="">Company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id !== r.companyId && used.has(c.id)}>
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
                  onChange={(e) => edit((prev) => prev.map((x) => (x.uid === r.uid ? { ...x, pct: e.target.value } : x)))}
                  disabled={frozen}
                  className="w-24 px-3 py-1.5 bg-surface border border-hairline rounded-control text-sm font-mono text-ink text-right focus:outline-none focus:border-accent"
                  placeholder="0.00"
                />
                <span className="text-xs">%</span>
              </div>
              <span className="num text-sm min-w-[100px]">{amt !== null ? formatMoney(amt) : '—'}</span>
              {!frozen && (
                <button
                  type="button"
                  onClick={() => edit((prev) => prev.filter((x) => x.uid !== r.uid))}
                  aria-label="Remove row"
                  className="hover:text-danger text-sm px-1 transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}

        {/* HOUZS Venture's share — its own-share row, never a company (2026-11-04). */}
        <div role="group" aria-label="HOUZS Venture" className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 bg-surface border border-hairline rounded-control text-sm min-w-[180px]">HV — HOUZS Venture</div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={hvPct}
              onChange={(e) => {
                setHvPct(e.target.value)
                setDirty(true)
                setSavedNote(false)
              }}
              disabled={frozen}
              aria-label="HOUZS Venture %"
              className="w-24 px-3 py-1.5 bg-surface border border-hairline rounded-control text-sm font-mono text-ink text-right focus:outline-none focus:border-accent"
              placeholder="0.00"
            />
            <span className="text-xs">%</span>
          </div>
          <span className="num text-sm min-w-[100px]">{hvAmount !== null ? formatMoney(hvAmount) : '—'}</span>
          <span className="text-[11px]">own share</span>
        </div>

        {/* What it does not bill on stays its own cost — auto, never stored. */}
        <div role="group" aria-label={staysLabel} className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 bg-surface-2 border border-dashed border-hairline rounded-control text-sm min-w-[180px]">
            {staysLabel}
          </div>
          <div className="flex items-center gap-1">
            <div className="w-24 px-3 py-1.5 bg-surface-2 border border-dashed border-hairline rounded-control text-sm font-mono text-right">
              {staysPct !== null ? staysPct.toFixed(2) : '—'}
            </div>
            <span className="text-xs">%</span>
          </div>
          <span className="num text-sm min-w-[100px]">{preview ? formatMoney(preview.stays) : '—'}</span>
          <span className="text-[11px]">{`auto · ${department.name} bears it`}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-3 pt-3 border-t border-hairline">
        <div className="text-xs">
          {billed !== null && (
            <span>
              Billed to subsidiaries <span className="num text-ink font-bold">{formatMoney(billed)}</span>
            </span>
          )}
          {error && <span className="text-danger ml-2">{error}</span>}
          {savedNote && !dirty && <span className="chip ledger ml-2"><span className="dot" />Saved.</span>}
        </div>
        {locked && <p className="text-xs sm:text-right m-0">Payroll for this month is closed for good</p>}
        {!frozen && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => edit((prev) => [...prev, { uid: crypto.randomUUID(), companyId: '', pct: '' }])}
              className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-1.5 rounded-control transition-colors"
            >
              + Company
            </button>
            {lastMonthBillTo.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  edit(() => toEditRows(lastMonthBillTo))
                  setHvPct(hvOf(lastMonthBillTo))
                }}
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-1.5 rounded-control transition-colors"
              >
                Copy last month’s %
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
    </section>
  )
}
