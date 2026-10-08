'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import {
  allocateExpense,
  billedTotal,
  headcountByCompany,
  type AllocMethod,
  type AllocationLine,
  type StaffSplit,
} from '@/lib/billing-allocator'
import { formatMoney } from '@/lib/utils'
import { saveAllocBatch, updateAllocTxn, type ExpenseBatchInput } from '../actions'
import type { AllocatorData, TxnRow } from './types'
import { unwrap } from './unwrap'

// Calculate on the sheet (2026-10-07; the user approved the allocator
// sample): the headcount source in a toolbar, each expense a card with its
// fields labelled, the preview as a table — Bill to, the basis, the share —
// with the billable total under it, and Save allocation below. The engine,
// the templates, the split editors and the save path are as they were.

// Split-editor key for "HV bears this share itself" — engine gets null.
const OWN_SPLIT = '__own__'

interface Row {
  key: number
  description: string
  amount: string
  method: AllocMethod
  categoryId: string
  /** companyId → pct/amount strings, editable inline. */
  pct: Record<string, string>
  custom: Record<string, string>
}

const fieldCls =
  'w-full px-2.5 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'
const labelCls = 'block text-[10px] font-sans uppercase tracking-[0.06em] text-graphite mb-1'
const monthName = (period: string) => dayjs(`${period}-01`).format('MMMM YYYY')

export default function CalculateTab({
  data,
  editTxn,
  onDoneEditing,
  onSaved,
}: {
  data: AllocatorData
  /** A Records row being corrected — prefills the form; saving OVERWRITES it. */
  editTxn?: TxnRow | null
  onDoneEditing: () => void
  onSaved: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<Row[]>([blankRow(0)])
  // 'current' or a snapshot period 'YYYY-MM' — ANY saved month is pickable
  // (user 2026-08-13: bill one month on another month's list).
  const [hcSource, setHcSource] = useState<string>('current')
  const [error, setError] = useState<string | null>(null)
  const [nextKey, setNextKey] = useState(1)

  // Entering edit mode: load the txn back into a single form row. Percentage
  // splits reconstruct from the stored "17.5%" detail strings; custom from the
  // stored amounts (dept targets can't appear — those editors are company-only).
  useEffect(() => {
    if (!editTxn) return
    const pct: Record<string, string> = {}
    const custom: Record<string, string> = {}
    for (const d of editTxn.details) {
      // Own-share rows come back as the OWN_SPLIT slot; dept rows can't appear
      // in these editors (company-only), skip them defensively.
      const key = d.isOwnShare || d.companyId === null ? OWN_SPLIT : d.companyId
      if (key !== OWN_SPLIT && key.startsWith('dept:')) continue
      if (editTxn.method === 'percentage') pct[key] = String(parseFloat(d.detail) || '')
      if (editTxn.method === 'custom') custom[key] = String(d.amount)
    }
    setRows([{
      key: 0,
      description: editTxn.description,
      amount: String(editTxn.amount),
      method: editTxn.method as AllocMethod,
      categoryId: editTxn.categoryId ?? '',
      pct,
      custom,
    }])
    setHcSource(editTxn.hcPeriod ?? 'current')
    setError(null)
  }, [editTxn])

  const cancelEdit = () => {
    setRows([blankRow(nextKey)])
    setNextKey((k) => k + 1)
    onDoneEditing()
  }

  // Staff splits for the client-side preview (server recomputes on save).
  // Target keys are opaque to the engine: company uuid / dept:<uuid> / null own.
  // A snapshot source uses THAT MONTH'S rows — the same rows the server will
  // load — so the preview always matches what gets saved (user 2026-08-01:
  // "要确保是会用我选的月份的名单去计算").
  const staffSplits: StaffSplit[] = useMemo(
    () =>
      hcSource !== 'current'
        ? (data.snapshotSplitsByPeriod[hcSource] ?? []).map((x) => ({
            companyId: x.targetId,
            pct: x.pct,
          }))
        : data.staff
            .filter((s) => s.status === 'active')
            .flatMap((s) => s.splits.map((x) => ({ companyId: x.targetId, pct: x.pct }))),
    [data.staff, data.snapshotSplitsByPeriod, hcSource],
  )

  // Billable targets = subsidiaries + departments the headcount references
  // (mirrors saveAllocBatch — Equal and headcount include e.g. Marketing).
  const targets = useMemo(() => {
    const referenced = new Set(
      staffSplits.map((s) => s.companyId).filter((k): k is string => !!k && k.startsWith('dept:')),
    )
    return [...data.companies, ...data.departments.filter((d) => referenced.has(d.id))]
  }, [data.companies, data.departments, staffSplits])

  const headcountTotal = useMemo(() => {
    let total = 0
    for (const v of headcountByCompany(staffSplits).values()) total += v
    return total
  }, [staffSplits])

  function blankRow(key: number): Row {
    return { key, description: '', amount: '', method: 'headcount', categoryId: '', pct: {}, custom: {} }
  }

  function applyTemplate(row: Row, templateId: string): Row {
    const t = data.templates.find((x) => x.id === templateId)
    if (!t) return row
    const pct: Record<string, string> = {}
    for (const s of t.splits) pct[s.companyId] = String(s.pct)
    return {
      ...row,
      description: t.name,
      amount: t.amount > 0 ? String(t.amount) : row.amount,
      method: t.method,
      categoryId: t.categoryId ?? '',
      pct,
    }
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const toInput = (r: Row): ExpenseBatchInput => ({
    description: r.description.trim(),
    amount: parseFloat(r.amount) || 0,
    method: r.method,
    categoryId: r.categoryId || null,
    percentSplits:
      r.method === 'percentage'
        ? Object.entries(r.pct)
            .map(([key, v]) => ({ companyId: key === OWN_SPLIT ? null : key, pct: parseFloat(v) || 0 }))
            .filter((x) => x.pct > 0)
        : undefined,
    customSplits:
      r.method === 'custom'
        ? Object.entries(r.custom)
            .map(([key, v]) => ({ companyId: key === OWN_SPLIT ? null : key, amount: parseFloat(v) || 0 }))
            .filter((x) => x.amount > 0)
        : undefined,
  })

  // Preview recomputes on every keystroke — the engine is pure and tiny.
  const preview = useMemo(() => {
    const out: { row: Row; lines?: AllocationLine[]; error?: string }[] = []
    for (const r of rows) {
      if (!r.description.trim() && !(parseFloat(r.amount) > 0)) continue
      try {
        const lines = allocateExpense(toInput(r), {
          companies: targets,
          staffSplits,
          hcLabel: hcSource !== 'current' ? hcSource : 'current',
        })
        out.push({ row: r, lines })
      } catch (err) {
        out.push({ row: r, error: err instanceof Error ? err.message : 'invalid' })
      }
    }
    return out
  }, [rows, staffSplits, targets, hcSource])

  const previewOk = preview.length > 0 && preview.every((p) => !p.error)
  const billedSum = preview.reduce((s, p) => s + (p.lines ? billedTotal(p.lines) : 0), 0)
  const targetLabel = (companyId: string | null) =>
    (targets.find((c) => c.id === companyId)?.label ?? '?').replace(/ \(dept\)$/, '')

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        const hcMode = hcSource === 'current' ? ('current' as const) : ('snapshot' as const)
        const hcPeriod = hcSource === 'current' ? undefined : hcSource
        if (editTxn) {
          const first = preview.find((p) => p.lines)
          if (!first) throw new Error('Nothing to save')
          unwrap(await updateAllocTxn({ txnId: editTxn.id, hcMode, hcPeriod, expense: toInput(first.row) }))
        } else {
          const expenses = preview.filter((p) => p.lines).map((p) => toInput(p.row))
          unwrap(await saveAllocBatch({ period: data.period, hcMode, hcPeriod, expenses }))
        }
        setRows([blankRow(nextKey)])
        setNextKey((k) => k + 1)
        router.refresh()
        onSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  const activeCount = data.staff.filter((s) => s.status === 'active').length
  const month = monthName(data.period)

  return (
    <div className="alloc-sheet fin-queue">
      {editTxn ? (
        <div className="gen-strip" role="region" aria-label="Correcting a record">
          <span className="text-sm">
            Correcting <span className="font-mono">{editTxn.txnNo}</span> — saving overwrites the record; its number stays.
          </span>
          <button type="button" onClick={cancelEdit} className="bulk-quiet font-sans text-sm">
            Cancel
          </button>
        </div>
      ) : null}

      {/* Headcount source — any saved month's snapshot is pickable */}
      <div className="sheet-toolbar">
        <span className="flex flex-col gap-1">
          <label htmlFor="alloc-hc-source" className={`${labelCls} mb-0`}>Headcount from</label>
          <select id="alloc-hc-source" value={hcSource} onChange={(e) => setHcSource(e.target.value)}>
            <option value="current">Current list · {activeCount} active</option>
            {data.snapshotPeriods.length === 0 ? (
              <option value="" disabled>No snapshot yet — save one on Staff</option>
            ) : (
              data.snapshotPeriods.map((p) => (
                <option key={p} value={p}>{monthName(p)} snapshot</option>
              ))
            )}
          </select>
        </span>
        <span className={`text-xs self-end pb-2 ${hcSource !== 'current' && hcSource !== data.period ? 'text-alert' : 'text-graphite'}`}>
          {hcSource === 'current'
            ? 'The list as it stands today.'
            : hcSource !== data.period
              ? `⚠ Using the ${monthName(hcSource)} list for ${month}.`
              : `The ${monthName(hcSource)} snapshot — the rows that get saved with the record.`}
        </span>
      </div>

      {/* Expense rows */}
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="bg-surface border border-hairline rounded-md p-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label htmlFor={`alloc-tpl-${r.key}`} className={labelCls}>Template</label>
                <select
                  id={`alloc-tpl-${r.key}`}
                  className={fieldCls}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) update(r.key, applyTemplate(r, e.target.value))
                  }}
                >
                  <option value="">—</option>
                  {data.templates
                    .filter((t) => t.status === 'active')
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <label htmlFor={`alloc-desc-${r.key}`} className={labelCls}>Description</label>
                <input
                  id={`alloc-desc-${r.key}`}
                  value={r.description}
                  onChange={(e) => update(r.key, { description: e.target.value })}
                  className={fieldCls}
                  placeholder="e.g. Office Rental"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`alloc-amount-${r.key}`} className={labelCls}>Amount RM</label>
                <input
                  id={`alloc-amount-${r.key}`}
                  type="number" step="0.01" min="0"
                  value={r.amount}
                  onChange={(e) => update(r.key, { amount: e.target.value })}
                  className={`${fieldCls} font-mono tabular text-right`}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`alloc-method-${r.key}`} className={labelCls}>Method</label>
                <select
                  id={`alloc-method-${r.key}`}
                  value={r.method}
                  onChange={(e) => update(r.key, { method: e.target.value as AllocMethod })}
                  className={fieldCls}
                >
                  <option value="headcount">Headcount</option>
                  <option value="percentage">Percentage</option>
                  <option value="equal">Equal</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`alloc-cat-${r.key}`} className={labelCls}>Category</label>
                <div className="flex items-center gap-1.5">
                  <select
                    id={`alloc-cat-${r.key}`}
                    value={r.categoryId}
                    onChange={(e) => update(r.key, { categoryId: e.target.value })}
                    className={fieldCls}
                  >
                    <option value="">—</option>
                    {data.categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    className="text-muted hover:text-danger font-mono px-1"
                    aria-label="Remove expense"
                    title="Remove this expense"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>

            {r.method === 'percentage' ? (
              <SplitEditor
                label="Each company's % — they must total 100; HV's own share goes in the first box"
                companies={[{ id: OWN_SPLIT, label: 'HV own (not billed)' }, ...data.companies]}
                values={r.pct}
                suffix="%"
                onChange={(pct) => update(r.key, { pct })}
              />
            ) : null}
            {r.method === 'custom' ? (
              <SplitEditor
                label="Each company's amount in RM — HV's own share goes in the first box"
                companies={[{ id: OWN_SPLIT, label: 'HV own (not billed)' }, ...data.companies]}
                values={r.custom}
                suffix="RM"
                onChange={(custom) => update(r.key, { custom })}
              />
            ) : null}
          </div>
        ))}
        {!editTxn ? (
          <button
            type="button"
            onClick={() => { setRows((prev) => [...prev, blankRow(nextKey)]); setNextKey((k) => k + 1) }}
            className="btn-quiet-sheet"
          >
            + Add another expense
          </button>
        ) : null}
      </div>

      {/* Preview — who is billed, on what basis, how much */}
      {preview.length > 0 ? (
        <section className="mt-8">
          <div className="sect-head">
            <h2>Preview</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {preview.length} {preview.length === 1 ? 'EXPENSE' : 'EXPENSES'}
              {headcountTotal > 0 ? ` · HEADCOUNT ${headcountTotal.toFixed(2)}` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table w-full">
              <thead>
                <tr>
                  <th>Bill to</th>
                  <th>Basis</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <Fragment key={p.row.key}>
                    {preview.length > 1 || p.error ? (
                      <tr>
                        <td colSpan={3} className="font-semibold">
                          {p.row.description || <span className="text-muted">Untitled</span>}
                          <span className="q-meta">
                            {p.row.method} · {formatMoney(parseFloat(p.row.amount) || 0)}
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    {p.error ? (
                      <tr>
                        <td colSpan={3} className="text-danger text-sm">{p.error}</td>
                      </tr>
                    ) : (
                      p.lines!.map((l, i) => (
                        <tr key={i} className={l.isOwnShare ? 'own' : undefined}>
                          <td className="whitespace-nowrap">
                            {l.isOwnShare ? 'HV own' : targetLabel(l.companyId)}
                            {!l.isOwnShare && l.companyId?.startsWith('dept:') ? <span className="q-meta">dept pool</span> : null}
                          </td>
                          <td className="font-mono text-[12px] text-graphite">{l.detail}</td>
                          <td className="num whitespace-nowrap">{formatMoney(l.amount)}</td>
                        </tr>
                      ))
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Billable total · HV own left out</td>
                  <td className="num font-semibold whitespace-nowrap">{formatMoney(billedSum)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="mt-4 bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      <div className="flex items-center gap-4 flex-wrap pt-5">
        <button
          type="button"
          onClick={save}
          disabled={isPending || !previewOk}
          className="bulk-pri font-serif italic text-sm"
        >
          {isPending ? 'Saving…' : editTxn ? `Overwrite ${editTxn.txnNo}` : 'Save allocation'}
        </button>
        <span className="text-xs text-graphite">
          {editTxn
            ? 'The record keeps its number; its split is replaced with this one.'
            : `Saved into ${month}’s records; Generate on Records then raises the drafts.`}
        </span>
      </div>
    </div>
  )
}

function SplitEditor({
  label, companies, values, suffix, onChange,
}: {
  label: string
  companies: { id: string; label: string }[]
  values: Record<string, string>
  suffix: string
  onChange: (v: Record<string, string>) => void
}) {
  return (
    <div className="mt-3 pt-3 border-t border-hairline">
      <div className="text-xs font-sans text-graphite mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {companies.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 bg-paper border border-hairline rounded-md px-2 py-1">
            <span className="font-mono text-xs text-graphite">{c.label}</span>
            <input
              type="number" step="0.01" min="0"
              value={values[c.id] ?? ''}
              onChange={(e) => onChange({ ...values, [c.id]: e.target.value })}
              className="w-20 bg-transparent text-right font-mono tabular text-sm text-ink focus:outline-none"
              placeholder="0"
            />
            <span className="text-[10px] text-muted">{suffix}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
