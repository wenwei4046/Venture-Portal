'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  allocateExpense,
  billedTotal,
  type AllocMethod,
  type AllocationLine,
  type StaffSplit,
} from '@/lib/billing-allocator'
import { saveAllocBatch, updateAllocTxn, type ExpenseBatchInput } from '../actions'
import type { AllocatorData, TxnRow } from './types'

const fmt = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

const inputCls =
  'px-2.5 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'

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
  const [hcMode, setHcMode] = useState<'current' | 'snapshot'>('current')
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
      if (d.isOwnShare || !d.companyId || d.companyId.startsWith('dept:')) continue
      if (editTxn.method === 'percentage') pct[d.companyId] = String(parseFloat(d.detail) || '')
      if (editTxn.method === 'custom') custom[d.companyId] = String(d.amount)
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
    setHcMode(editTxn.hcPeriod ? 'snapshot' : 'current')
    setError(null)
  }, [editTxn])

  const cancelEdit = () => {
    setRows([blankRow(nextKey)])
    setNextKey((k) => k + 1)
    onDoneEditing()
  }

  const hasSnapshot = data.snapshotPeriods.includes(data.period)

  // Staff splits for the client-side preview (server recomputes on save).
  // Target keys are opaque to the engine: company uuid / dept:<uuid> / null own.
  // hcMode=snapshot uses THE PERIOD'S SNAPSHOT — the same rows the server will
  // load — so the preview always matches what gets saved (user 2026-08-01:
  // "要确保是会用我选的月份的名单去计算").
  const staffSplits: StaffSplit[] = useMemo(
    () =>
      hcMode === 'snapshot'
        ? data.snapshotSplits.map((x) => ({ companyId: x.targetId, pct: x.pct }))
        : data.staff
            .filter((s) => s.status === 'active')
            .flatMap((s) => s.splits.map((x) => ({ companyId: x.targetId, pct: x.pct }))),
    [data.staff, data.snapshotSplits, hcMode],
  )

  // Billable targets = subsidiaries + departments the headcount references
  // (mirrors saveAllocBatch — Equal and headcount include e.g. Marketing).
  const targets = useMemo(() => {
    const referenced = new Set(
      staffSplits.map((s) => s.companyId).filter((k): k is string => !!k && k.startsWith('dept:')),
    )
    return [...data.companies, ...data.departments.filter((d) => referenced.has(d.id))]
  }, [data.companies, data.departments, staffSplits])

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
            .map(([companyId, v]) => ({ companyId, pct: parseFloat(v) || 0 }))
            .filter((x) => x.pct > 0)
        : undefined,
    customSplits:
      r.method === 'custom'
        ? Object.entries(r.custom)
            .map(([companyId, v]) => ({ companyId, amount: parseFloat(v) || 0 }))
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
          hcLabel: hcMode === 'snapshot' ? data.period : 'current',
        })
        out.push({ row: r, lines })
      } catch (err) {
        out.push({ row: r, error: err instanceof Error ? err.message : 'invalid' })
      }
    }
    return out
  }, [rows, staffSplits, targets, hcMode, data.period])

  const previewOk = preview.length > 0 && preview.every((p) => !p.error)
  const billedSum = preview.reduce((s, p) => s + (p.lines ? billedTotal(p.lines) : 0), 0)

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        if (editTxn) {
          const first = preview.find((p) => p.lines)
          if (!first) throw new Error('Nothing to save')
          await updateAllocTxn({ txnId: editTxn.id, hcMode, expense: toInput(first.row) })
        } else {
          const expenses = preview.filter((p) => p.lines).map((p) => toInput(p.row))
          await saveAllocBatch({ period: data.period, hcMode, expenses })
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

  return (
    <div className="space-y-6">
      {editTxn ? (
        <div className="border border-accent-border bg-accent-bg rounded-md p-3 flex items-center justify-between flex-wrap gap-2">
          <span className="font-serif italic text-accent text-sm">
            正在修改 <span className="font-mono not-italic text-ink">{editTxn.txnNo}</span> — 存档会覆盖原记录(单号不变)
          </span>
          <button type="button" onClick={cancelEdit} className="text-sm text-graphite hover:text-ink font-sans">
            取消修改
          </button>
        </div>
      ) : null}

      {/* Headcount source */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs uppercase tracking-wide text-muted font-sans">Headcount 用</span>
        <select
          value={hcMode}
          onChange={(e) => setHcMode(e.target.value as 'current' | 'snapshot')}
          className={inputCls}
        >
          <option value="current">现在的名单 · current list</option>
          <option value="snapshot" disabled={!hasSnapshot}>
            {data.period} 快照{hasSnapshot ? '' : '(还没存 — 去名单 tab 存)'}
          </option>
        </select>
      </div>

      {/* Expense rows */}
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.key} className="bg-surface border border-hairline rounded-md p-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label className="block text-xs font-sans text-graphite mb-1">模板带出(可选)</label>
                <select
                  className={`${inputCls} w-full`}
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
                <label className="block text-xs font-sans text-graphite mb-1">描述 *</label>
                <input
                  value={r.description}
                  onChange={(e) => update(r.key, { description: e.target.value })}
                  className={`${inputCls} w-full`}
                  placeholder="e.g. Office Rental"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-sans text-graphite mb-1">金额 RM *</label>
                <input
                  type="number" step="0.01" min="0"
                  value={r.amount}
                  onChange={(e) => update(r.key, { amount: e.target.value })}
                  className={`${inputCls} w-full font-mono tabular`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-sans text-graphite mb-1">方法</label>
                <select
                  value={r.method}
                  onChange={(e) => update(r.key, { method: e.target.value as AllocMethod })}
                  className={`${inputCls} w-full`}
                >
                  <option value="headcount">Headcount</option>
                  <option value="percentage">Percentage</option>
                  <option value="equal">Equal</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-sans text-graphite mb-1">类别</label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={r.categoryId}
                    onChange={(e) => update(r.key, { categoryId: e.target.value })}
                    className={`${inputCls} w-full`}
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
                    title="删掉这行"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>

            {r.method === 'percentage' ? (
              <SplitEditor
                label="各公司 %(合计要 100)"
                companies={data.companies}
                values={r.pct}
                suffix="%"
                onChange={(pct) => update(r.key, { pct })}
              />
            ) : null}
            {r.method === 'custom' ? (
              <SplitEditor
                label="各公司金额 RM"
                companies={data.companies}
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
            className="text-sm text-accent hover:text-accent-hover font-serif italic"
          >
            + 加一笔费用
          </button>
        ) : null}
      </div>

      {/* Preview */}
      {preview.length > 0 ? (
        <div className="border border-hairline rounded-md overflow-hidden">
          <div className="bg-surface-2 px-4 py-2 font-sans text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent">
            预览 · Preview
          </div>
          <div className="divide-y divide-hairline">
            {preview.map((p) => (
              <div key={p.row.key} className="px-4 py-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="font-serif text-md text-ink">
                    {p.row.description || <em className="text-muted">未命名</em>}
                    <span className="ml-2 font-mono text-[11px] text-muted uppercase">{p.row.method}</span>
                  </span>
                  <span className="font-mono tabular text-sm text-ink">RM {fmt(parseFloat(p.row.amount) || 0)}</span>
                </div>
                {p.error ? (
                  <div className="font-serif italic text-danger text-sm">{p.error}</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {p.lines!.map((l, i) => (
                      <span
                        key={i}
                        title={l.detail}
                        className={`px-2 py-0.5 rounded-md border text-xs font-mono tabular ${
                          l.isOwnShare
                            ? 'bg-surface text-muted border-hairline italic'
                            : 'bg-accent-bg text-ink border-accent-border'
                        }`}
                      >
                        {l.isOwnShare ? 'HV own' : targets.find((c) => c.id === l.companyId)?.label}
                        {' '}{fmt(l.amount)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="bg-surface-2 px-4 py-2.5 flex items-baseline justify-between">
            <span className="font-serif italic text-graphite text-sm">会开单的合计(不含 HV own)</span>
            <span className="font-mono tabular font-semibold text-ink">RM {fmt(billedSum)}</span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      <div className="flex items-center gap-4 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending || !previewOk}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          {isPending ? '存档中…' : editTxn ? `覆盖 ${editTxn.txnNo}` : `存进 ${data.period} 记录`}
        </button>
        <span className="font-serif italic text-muted text-xs">
          {editTxn ? '覆盖后原来的分摊明细整个换成新算的。' : '存档后去「记录」tab 一键开 draft invoice。'}
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
