'use client'

import { useMemo, useRef, useState } from 'react'
import { FinDrawer, drawerStyles as d } from '@/components/finv/Drawer'
import { Field, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { money, neededSentence, num } from '@/components/finv/form-words'
import { Select } from '@/components/hrv/select'
import { allocateExpense, billedTotal, type AllocMethod, type AllocationLine, type StaffSplit } from '@/lib/billing-allocator'
import { shareLine } from '@/lib/allocator-sheet'
import { saveAllocBatch, updateAllocTxn, type ExpenseBatchInput } from '../actions'
import type { AllocatorData, TxnRow } from './types'
import a from './alloc.module.css'

// + New allocation (2026-10-14, the Finance revamp v2 — D11, the prototype's
// `vCalc` in the 460px drawer): a white card of the expense's fields —
// Template, Description, Amount RM, Method, Category — then *Preview · HV own
// left out*, a row a share and the billable total on peach; at its foot
// *+ Add expense* and *Save allocation*. The system's Calculate, kept whole:
// several expenses saved as one batch, a Percentage or Custom split typed
// company by company (HV's own share in the first box), the headcount read off
// another month's snapshot (*Headcount from*, behind the small button), and a
// record corrected in place — *Correct* loads it here; saving overwrites it and
// its number stays. The server works every split out again; the preview is the
// same engine on the same list.

const OWN = '__own__'
const METHODS: ReadonlyArray<{ value: AllocMethod; label: string }> = [
  { value: 'headcount', label: 'Headcount' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'equal', label: 'Equal' },
  { value: 'custom', label: 'Custom' },
]
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthLong = (ym: string) => `${MONTH[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
const r2 = (n: number) => Math.round(n * 100) / 100

interface Expense {
  key: number
  template: string
  description: string
  amount: string
  method: AllocMethod
  categoryId: string
  /** company uuid (or OWN) → the typed % / RM. */
  pct: Record<string, string>
  custom: Record<string, string>
}

/** A record back in the form: a Percentage split from its "17.5%" details, a Custom one from its amounts. */
function fromTxn(t: TxnRow, key: number): Expense {
  const pct: Record<string, string> = {}
  const custom: Record<string, string> = {}
  for (const x of t.details) {
    const id = x.isOwnShare || x.companyId === null ? OWN : x.companyId
    // The editors are company-only: a department's share cannot be typed back in.
    if (id !== OWN && id.startsWith('dept:')) continue
    if (t.method === 'percentage') pct[id] = String(parseFloat(x.detail) || '')
    if (t.method === 'custom') custom[id] = String(x.amount)
  }
  return { key, template: '', description: t.description, amount: String(t.amount), method: t.method as AllocMethod, categoryId: t.categoryId ?? '', pct, custom }
}

const blank = (key: number): Expense => ({ key, template: '', description: '', amount: '', method: 'headcount', categoryId: '', pct: {}, custom: {} })

function toInput(e: Expense, amount = num(e.amount)): ExpenseBatchInput {
  return {
    description: e.description.trim(),
    amount,
    method: e.method,
    categoryId: e.categoryId || null,
    percentSplits:
      e.method === 'percentage'
        ? Object.entries(e.pct)
            .map(([id, v]) => ({ companyId: id === OWN ? null : id, pct: num(v) }))
            .filter((x) => x.pct > 0)
        : undefined,
    customSplits:
      e.method === 'custom'
        ? Object.entries(e.custom)
            .map(([id, v]) => ({ companyId: id === OWN ? null : id, amount: num(v) }))
            .filter((x) => x.amount > 0)
        : undefined,
  }
}

interface Preview {
  exp: Expense
  lines?: AllocationLine[]
  error?: string
  /** No amount yet: the split worked out on RM 100, its figures shown as 0.00 (the design draws the rows from the start). */
  nominal: boolean
}

export default function AllocationCalc({
  open,
  onClose,
  onSaved,
  data,
  edit,
}: {
  open: boolean
  onClose: () => void
  /** The toast, once saved. */
  onSaved: (message: string) => void
  data: AllocatorData
  /** A record being corrected — saving overwrites it, its number kept. */
  edit: TxnRow | null
}) {
  const keySeq = useRef(0)
  const nextKey = () => ++keySeq.current
  const [rows, setRows] = useState<Expense[]>(() => [edit ? fromTxn(edit, nextKey()) : blank(nextKey())])
  // 'current', or the month of a saved snapshot — any month (user 2026-08-13: bill one month on another's list).
  const [hcSource, setHcSource] = useState<string>(() => (edit?.method === 'headcount' && edit.hcPeriod ? edit.hcPeriod : 'current'))
  const [showHc, setShowHc] = useState(() => hcSource !== 'current')
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setRow = (key: number, patch: Partial<Expense>) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  // The list the preview counts — the rows the server will load (user 2026-08-01: 要确保是会用我选的月份的名单去计算).
  const staffSplits: StaffSplit[] = useMemo(
    () =>
      hcSource !== 'current'
        ? (data.snapshotSplitsByPeriod[hcSource] ?? []).map((x) => ({ companyId: x.targetId, pct: x.pct }))
        : data.staff.filter((s) => s.status === 'active').flatMap((s) => s.splits.map((x) => ({ companyId: x.targetId, pct: x.pct }))),
    [data.staff, data.snapshotSplitsByPeriod, hcSource],
  )
  // Who may be billed: the companies switched on, and the departments the headcount names (as saveAllocBatch).
  const targets = useMemo(() => {
    const named = new Set(staffSplits.map((x) => x.companyId).filter((k): k is string => !!k && k.startsWith('dept:')))
    return [...data.companies, ...data.departments.filter((dp) => named.has(dp.id))]
  }, [data.companies, data.departments, staffSplits])
  const labelOf = (id: string | null) => (id === null ? 'HV own (not billed)' : (targets.find((t) => t.id === id)?.label ?? '?').replace(/ \(dept\)$/, ''))

  const previews: Preview[] = useMemo(() => {
    const ctx = { companies: targets, staffSplits, hcLabel: hcSource }
    const out: Preview[] = []
    for (const e of rows) {
      const amount = num(e.amount)
      const touched = e.description.trim() !== '' || amount > 0
      try {
        if (amount > 0) out.push({ exp: e, lines: allocateExpense(toInput(e), ctx), nominal: false })
        else out.push({ exp: e, lines: allocateExpense({ ...toInput(e, 100), description: e.description.trim() || 'This expense' }, ctx), nominal: true })
      } catch (err) {
        if (touched) out.push({ exp: e, error: err instanceof Error ? err.message : 'It cannot be split this way.', nominal: false })
      }
    }
    return out
  }, [rows, targets, staffSplits, hcSource])

  const billable = r2(previews.reduce((s, p) => s + (p.lines && !p.nominal ? billedTotal(p.lines) : 0), 0))
  const need: string[] = []
  if (rows.some((r) => !r.description.trim())) need.push(rows.length > 1 ? 'each expense’s description' : 'a description')
  if (rows.some((r) => !(num(r.amount) > 0))) need.push(rows.length > 1 ? 'each expense’s amount' : 'an amount')
  const failed = previews.find((p) => p.error)
  const problem = neededSentence(need) ?? failed?.error ?? null
  const ok = problem === null

  const applyTemplate = (e: Expense, id: string): Partial<Expense> => {
    const t = data.templates.find((x) => x.id === id)
    if (!t) return { template: '' }
    const pct: Record<string, string> = {}
    for (const s of t.splits) pct[s.companyId] = String(s.pct)
    return { template: id, description: t.name, amount: t.amount > 0 ? String(t.amount) : e.amount, method: t.method, categoryId: t.categoryId ?? '', pct }
  }

  const save = async () => {
    setTried(true)
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    const hcMode = hcSource === 'current' ? ('current' as const) : ('snapshot' as const)
    const hcPeriod = hcSource === 'current' ? undefined : hcSource
    try {
      if (edit) {
        const res = await updateAllocTxn({ txnId: edit.id, hcMode, hcPeriod, expense: toInput(rows[0]) })
        if (res.error) throw new Error(res.error)
        onSaved(`${res.txnNo || edit.txnNo} corrected — the same number, the new split`)
      } else {
        const res = await saveAllocBatch({ period: data.period, hcMode, hcPeriod, expenses: rows.map((r) => toInput(r)) })
        if (res.error) throw new Error(res.error)
        onSaved(res.txnNos.length === 1 ? `${res.txnNos[0]} saved — appears in Records` : `${res.txnNos.length} allocations saved — they appear in Records`)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const categories = data.categories
  const snapshotMonths = data.snapshotPeriods
  const otherMonth = hcSource !== 'current' && hcSource !== data.period

  const bar = [
    ...(edit
      ? []
      : [
          <button key="add" type="button" className={d.barBtn} disabled={busy} onClick={() => setRows((prev) => [...prev, blank(nextKey())])}>
            + Add expense
          </button>,
        ]),
    <button key="save" type="button" className={d.barBtn} data-kind="primary" data-off={ok ? undefined : 'true'} disabled={busy} onClick={save}>
      {busy ? 'Saving…' : 'Save allocation'}
    </button>,
  ]

  return (
    <FinDrawer open={open} onClose={() => !busy && onClose()} label={edit ? `Correct ${edit.txnNo}` : 'New allocation'} title={edit ? `Correct ${edit.txnNo}` : 'New allocation'} bar={bar}>
      {rows.map((r, i) => (
        <div key={r.key} className={a.card} role="group" aria-label={rows.length > 1 ? `Expense ${i + 1}` : 'Expense'}>
          {rows.length > 1 ? (
            <div className={a.cardHead}>
              <span>Expense {i + 1}</span>
              <button type="button" className={a.cardRemove} onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))} disabled={busy}>
                Remove
              </button>
            </div>
          ) : null}
          <Field label="Template" htmlFor={`alloc-tpl-${r.key}`}>
            <Select id={`alloc-tpl-${r.key}`} round={12} className={fm.select} value={r.template} onChange={(e) => setRow(r.key, applyTemplate(r, e.target.value))}>
              <option value="">No template</option>
              {data.templates
                .filter((t) => t.status === 'active')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Description" htmlFor={`alloc-desc-${r.key}`}>
            <Input id={`alloc-desc-${r.key}`} value={r.description} onChange={(e) => setRow(r.key, { description: e.target.value })} placeholder="e.g. Office Rental Oct" />
          </Field>
          <Field label="Amount RM" htmlFor={`alloc-amount-${r.key}`}>
            <Input id={`alloc-amount-${r.key}`} mono align="right" inputMode="decimal" value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Method" htmlFor={`alloc-method-${r.key}`}>
            <Select id={`alloc-method-${r.key}`} round={12} className={fm.select} value={r.method} onChange={(e) => setRow(r.key, { method: e.target.value as AllocMethod })}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor={`alloc-cat-${r.key}`}>
            <Select id={`alloc-cat-${r.key}`} round={12} className={fm.select} value={r.categoryId} onChange={(e) => setRow(r.key, { categoryId: e.target.value })}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.coaCode ? `${c.coaCode} · ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          </Field>
          {r.method === 'percentage' || r.method === 'custom' ? (
            <SplitEditor
              percent={r.method === 'percentage'}
              companies={data.companies}
              values={r.method === 'percentage' ? r.pct : r.custom}
              onChange={(v) => setRow(r.key, r.method === 'percentage' ? { pct: v } : { custom: v })}
              amount={num(r.amount)}
            />
          ) : null}
          {i === 0 ? (
            <>
              {showHc ? (
                <Field label="Headcount from" htmlFor="alloc-hc">
                  <Select id="alloc-hc" round={12} className={fm.select} value={hcSource} onChange={(e) => setHcSource(e.target.value)}>
                    <option value="current">Current list · {data.staff.filter((s) => s.status === 'active').length} active</option>
                    {snapshotMonths.map((p) => (
                      <option key={p} value={p}>
                        {monthLong(p)} snapshot
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <div className={fm.more}>
                <button
                  type="button"
                  className={fm.moreBtn}
                  aria-pressed={showHc}
                  onClick={() => {
                    if (showHc) setHcSource('current')
                    setShowHc((v) => !v)
                  }}
                >
                  Headcount from · {hcSource === 'current' ? 'current list' : `${monthLong(hcSource)} snapshot`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ))}

      {otherMonth ? (
        <p className={a.note} data-tone="alert">
          Using the {monthLong(hcSource)} list for {monthLong(data.period)}.
        </p>
      ) : null}
      {edit ? <p className={a.note}>Saving overwrites {edit.txnNo} — its number stays, its split is replaced.</p> : null}

      <div className={d.label}>Preview · HV own left out</div>
      <div className={a.preview} role="group" aria-label="Preview">
        {previews.length === 0 ? <div className={a.rowError}>Nothing to split yet.</div> : null}
        {previews.map((p) => {
          const amount = num(p.exp.amount)
          const head =
            previews.length > 1 ? (
              <div key={`h${p.exp.key}`} className={a.row} data-head="true">
                <span className={a.rowText}>
                  <span className={a.rowLabel}>{p.exp.description.trim() || 'Untitled expense'}</span>
                </span>
                <span className={a.rowValue}>{money(amount)}</span>
              </div>
            ) : null
          if (p.error) {
            return [
              head,
              <div key={`e${p.exp.key}`} className={a.rowError} role="alert">
                {p.error}
              </div>,
            ]
          }
          const total = p.nominal ? 100 : amount
          return [
            head,
            ...(p.lines ?? []).map((l, i) => (
              <div key={`${p.exp.key}-${i}`} className={a.row} data-own={l.isOwnShare ? 'true' : undefined}>
                <span className={a.rowText}>
                  <span className={a.rowLabel}>{l.isOwnShare ? 'HV own (not billed)' : labelOf(l.companyId)}</span>
                  <span className={a.rowSub}>{shareLine(l.detail, l.amount, p.exp.method === 'custom' && p.nominal ? (p.lines ?? []).reduce((s, x) => s + x.amount, 0) : total)}</span>
                </span>
                <span className={a.rowValue}>{money(p.nominal && p.exp.method !== 'custom' ? 0 : l.amount)}</span>
              </div>
            )),
          ]
        })}
        <div className={a.foot}>
          <span className={a.footLabel}>Billable total</span>
          <span className={a.footValue}>RM {money(billable)}</span>
        </div>
      </div>

      {error ? (
        <p className={a.note} data-tone="danger" role="alert">
          {error}
        </p>
      ) : tried && problem ? (
        <p className={a.note} role="alert">
          {problem}
        </p>
      ) : null}
    </FinDrawer>
  )
}

/** A Percentage or Custom split: HV's own box first, then each company; the sum on peach (red off 100%). */
function SplitEditor({
  percent,
  companies,
  values,
  onChange,
  amount,
}: {
  percent: boolean
  companies: ReadonlyArray<{ id: string; label: string }>
  values: Record<string, string>
  onChange: (v: Record<string, string>) => void
  amount: number
}) {
  const all = [{ id: OWN, label: 'HV own (not billed)' }, ...companies]
  const sum = r2(all.reduce((s, c) => s + num(values[c.id] ?? ''), 0))
  const off = percent ? Math.abs(sum - 100) > 0.005 : amount > 0 && Math.abs(sum - amount) > 0.005
  return (
    <Field label={percent ? 'Each company’s %' : 'Each company’s amount RM'}>
      <div className={a.split}>
        {all.map((c) => (
          <div key={c.id} className={a.splitRow} data-own={c.id === OWN ? 'true' : undefined}>
            <span className={a.splitLabel}>{c.label}</span>
            <input
              className={fm.lineAmount}
              inputMode="decimal"
              value={values[c.id] ?? ''}
              onChange={(e) => onChange({ ...values, [c.id]: e.target.value })}
              placeholder={percent ? '0' : '0.00'}
              aria-label={`${c.label} ${percent ? '%' : 'RM'}`}
            />
          </div>
        ))}
        <div className={a.splitFoot}>
          <span>{percent ? 'Total · must be 100%' : amount > 0 ? `Total · of RM ${money(amount)}` : 'Total'}</span>
          <span className={a.splitTotal} data-off={off ? 'true' : undefined}>
            {percent ? `${sum}%` : `RM ${money(sum)}`}
          </span>
        </div>
      </div>
    </Field>
  )
}
