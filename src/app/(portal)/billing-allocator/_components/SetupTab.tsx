'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AllocMethod } from '@/lib/billing-allocator'
import {
  saveAllocCategory, deleteAllocCategory,
  saveAllocTemplate, deleteAllocTemplate,
} from '../actions'
import type { AllocatorData, TemplateRow } from './types'

const inputCls =
  'px-2.5 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'

interface TplEdit {
  id?: string
  name: string
  method: AllocMethod
  amount: string
  categoryId: string
  status: 'active' | 'inactive'
  pct: Record<string, string>
}

export default function SetupTab({ data }: { data: AllocatorData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [catEdit, setCatEdit] = useState<{ id?: string; name: string; coaCode: string } | null>(null)
  const [tplEdit, setTplEdit] = useState<TplEdit | null>(null)

  const run = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      }
    })
  }

  const startTpl = (t?: TemplateRow) => {
    const pct: Record<string, string> = {}
    if (t) for (const s of t.splits) pct[s.companyId] = String(s.pct)
    setTplEdit(
      t
        ? { id: t.id, name: t.name, method: t.method, amount: String(t.amount || ''), categoryId: t.categoryId ?? '', status: t.status as 'active' | 'inactive', pct }
        : { name: '', method: 'headcount', amount: '', categoryId: '', status: 'active', pct: {} },
    )
  }

  return (
    <div className="space-y-10">
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      {/* ── Categories ── */}
      <section>
        <div className="sect-head">
          <h2>类别 · Categories</h2>
          <span className="rule" aria-hidden />
          <span className="count">{data.categories.length}</span>
        </div>
        <p className="font-serif italic text-muted text-xs mb-3 max-w-2xl">
          可选填一个 COA 收入科目 — 开出来的 invoice 行会用它入帐;留空则走系统默认(5000)。
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {data.categories.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 px-2.5 py-1 bg-surface border border-hairline rounded-md text-sm">
              <span className="font-serif text-ink">{c.name}</span>
              {c.coaCode ? <span className="font-mono text-[10px] text-accent">{c.coaCode}</span> : null}
              <button type="button" onClick={() => setCatEdit({ id: c.id, name: c.name, coaCode: c.coaCode })} className="text-accent hover:text-accent-hover font-serif italic text-xs">
                edit
              </button>
              <button type="button" onClick={() => run(() => deleteAllocCategory(c.id))} disabled={isPending} className="text-muted hover:text-danger font-mono text-xs">
                ×
              </button>
            </span>
          ))}
        </div>
        {catEdit ? (
          <div className="flex items-end gap-2 flex-wrap border border-accent-border bg-accent-bg rounded-md p-3">
            <div>
              <label className="block text-xs font-sans text-graphite mb-1">名称 *</label>
              <input value={catEdit.name} onChange={(e) => setCatEdit({ ...catEdit, name: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-sans text-graphite mb-1">COA code(可选)</label>
              <input value={catEdit.coaCode} onChange={(e) => setCatEdit({ ...catEdit, coaCode: e.target.value })} className={`${inputCls} font-mono w-28`} placeholder="e.g. 5040" />
            </div>
            <button
              type="button"
              onClick={() => run(async () => { await saveAllocCategory(catEdit); setCatEdit(null) })}
              disabled={isPending || !catEdit.name.trim()}
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-1.5 rounded-md disabled:opacity-50"
            >
              Save
            </button>
            <button type="button" onClick={() => setCatEdit(null)} className="text-sm text-graphite hover:text-ink font-sans px-2 py-1.5">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setCatEdit({ name: '', coaCode: '' })} className="text-sm text-accent hover:text-accent-hover font-serif italic">
            + 加类别
          </button>
        )}
      </section>

      {/* ── Templates ── */}
      <section>
        <div className="sect-head">
          <h2>费用模板 · Templates</h2>
          <span className="rule" aria-hidden />
          <span className="count">{data.templates.length}</span>
        </div>
        <p className="font-serif italic text-muted text-xs mb-3 max-w-2xl">
          每月重复的费用存成模板,计算时一选就带出名称 / 金额 / 方法 / 类别;
          Percentage 模板连各家比例一起带。
        </p>
        <div className="overflow-x-auto border border-hairline rounded-md mb-3">
          <table className="ledger-table w-full">
            <thead>
              <tr><th>Name</th><th>Method</th><th className="num">Default RM</th><th>Category</th><th>%</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {data.templates.map((t) => (
                <tr key={t.id}>
                  <td className="font-serif text-md text-ink">{t.name}</td>
                  <td><span className="px-2 py-0.5 bg-surface-2 rounded-md font-mono text-[10px] uppercase">{t.method}</span></td>
                  <td className="num font-mono tabular">{t.amount > 0 ? t.amount.toLocaleString('en-MY', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td className="text-sm text-graphite">{data.categories.find((c) => c.id === t.categoryId)?.name ?? '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1 py-1">
                      {t.splits.map((s) => (
                        <span key={s.companyId} className="px-1.5 py-0.5 bg-accent-bg border border-accent-border rounded font-mono text-[10px]">
                          {data.companies.find((c) => c.id === s.companyId)?.label} {s.pct}%
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="font-mono text-[10px] uppercase text-muted">{t.status}</td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" onClick={() => startTpl(t)} className="text-accent hover:text-accent-hover font-serif italic text-sm mr-3">Edit</button>
                    <button type="button" onClick={() => run(() => deleteAllocTemplate(t.id))} disabled={isPending} className="text-muted hover:text-danger font-mono text-sm">×</button>
                  </td>
                </tr>
              ))}
              {data.templates.length === 0 ? (
                <tr><td colSpan={7} className="font-serif italic text-muted text-sm">还没有模板。</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {tplEdit ? (
          <div className="border border-accent-border bg-accent-bg rounded-md p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-sans text-graphite mb-1">Name *</label>
                <input value={tplEdit.name} onChange={(e) => setTplEdit({ ...tplEdit, name: e.target.value })} className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="block text-xs font-sans text-graphite mb-1">Method</label>
                <select value={tplEdit.method} onChange={(e) => setTplEdit({ ...tplEdit, method: e.target.value as AllocMethod })} className={`${inputCls} w-full`}>
                  <option value="headcount">Headcount</option>
                  <option value="percentage">Percentage</option>
                  <option value="equal">Equal</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-sans text-graphite mb-1">Default RM</label>
                <input type="number" step="0.01" min="0" value={tplEdit.amount} onChange={(e) => setTplEdit({ ...tplEdit, amount: e.target.value })} className={`${inputCls} w-full font-mono tabular`} />
              </div>
              <div>
                <label className="block text-xs font-sans text-graphite mb-1">Category</label>
                <select value={tplEdit.categoryId} onChange={(e) => setTplEdit({ ...tplEdit, categoryId: e.target.value })} className={`${inputCls} w-full`}>
                  <option value="">—</option>
                  {data.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {tplEdit.method === 'percentage' ? (
              <div>
                <div className="text-xs font-sans text-graphite mb-1.5">各公司默认 %</div>
                <div className="flex flex-wrap gap-2">
                  {data.companies.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 bg-paper border border-hairline rounded-md px-2 py-1">
                      <span className="font-mono text-xs text-graphite">{c.label}</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={tplEdit.pct[c.id] ?? ''}
                        onChange={(e) => setTplEdit({ ...tplEdit, pct: { ...tplEdit.pct, [c.id]: e.target.value } })}
                        className="w-20 bg-transparent text-right font-mono tabular text-sm text-ink focus:outline-none"
                        placeholder="0"
                      />
                      <span className="text-[10px] text-muted">%</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    await saveAllocTemplate({
                      id: tplEdit.id,
                      name: tplEdit.name,
                      method: tplEdit.method,
                      amount: parseFloat(tplEdit.amount) || 0,
                      categoryId: tplEdit.categoryId || null,
                      status: tplEdit.status,
                      splits: Object.entries(tplEdit.pct)
                        .map(([companyId, v]) => ({ companyId, pct: parseFloat(v) || 0 }))
                        .filter((x) => x.pct > 0),
                    })
                    setTplEdit(null)
                  })
                }
                disabled={isPending || !tplEdit.name.trim()}
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-1.5 rounded-md disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setTplEdit(null)} className="text-sm text-graphite hover:text-ink font-sans">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => startTpl()} className="text-sm text-accent hover:text-accent-hover font-serif italic">
            + 加模板
          </button>
        )}
      </section>
    </div>
  )
}
