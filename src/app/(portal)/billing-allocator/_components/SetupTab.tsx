'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import AccountPicker from '@/components/AccountPicker'
import type { AllocMethod } from '@/lib/billing-allocator'
import {
  saveAllocCategory, deleteAllocCategory,
  saveAllocTemplate, deleteAllocTemplate,
  setAllocCompanyEnabled,
} from '../actions'
import type { AllocatorData, TemplateRow } from './types'
import { unwrap } from './unwrap'
import LedgerRow from '@/components/LedgerRow'

// The allocator's Setup (2026-10-10, the handoff, in English): three tables —
// Companies (Company / Code / an "In allocation" chip, "x / y ENABLED"),
// Categories (Account / Name) and Templates (Name / Method / Default RM /
// Category / a Status chip). A Percentage template's per-company % stays as
// Split % (the handoff's table has no column for it). Switching a company on
// or off, and adding or editing a category or a template, stay.

interface TplEdit {
  id?: string
  name: string
  method: AllocMethod
  amount: string
  categoryId: string
  status: 'active' | 'inactive'
  pct: Record<string, string>
}

const METHOD: Record<string, string> = { headcount: 'Headcount', percentage: 'Percentage', equal: 'Equal', custom: 'Custom' }

function Chip({ label, tone }: { label: string; tone: '' | 'ledger' | 'info' }) {
  return (
    <span className={tone ? `chip ${tone}` : 'chip'}>
      <i className="dot" />
      {label}
    </span>
  )
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

  const enabled = data.companySettings.filter((c) => c.enabled).length
  const companyLabel = (id: string) => data.companies.find((c) => c.id === id)?.label ?? data.companySettings.find((c) => c.id === id)?.label ?? '?'

  return (
    <div className="space-y-10">
      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      {/* ── Companies ── */}
      <section>
        <div className="sect-head">
          <h2>Companies</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {enabled} / {data.companySettings.length} ENABLED
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th>Company</th>
                <th>Code</th>
                <th>In allocation</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.companySettings.map((c) => (
                <tr key={c.id}>
                  <td>{c.name ?? c.label}</td>
                  <td className="font-sans font-medium text-[12px]">{c.code || c.label}</td>
                  <td>
                    <Chip label={c.enabled ? 'enabled' : 'off'} tone={c.enabled ? 'ledger' : ''} />
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => run(async () => { unwrap(await setAllocCompanyEnabled(c.id, !c.enabled)) })}
                      disabled={isPending}
                      title={c.enabled ? 'Take it out of the allocation' : 'Bring it back into the allocation'}
                      className="bil-row-btn"
                    >
                      {c.enabled ? 'Turn off' : 'Turn on'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Categories ── */}
      <section>
        <div className="sect-head">
          <h2>Categories</h2>
          <span className="rule" aria-hidden />
          <span className="count">{data.categories.length}</span>
        </div>
        <div className="overflow-x-auto mb-3">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th>Account</th>
                <th>Name</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.id}>
                  <td className="font-sans font-medium text-[12px]">{c.coaCode || <span className="text-muted">default</span>}</td>
                  <td>{c.name}</td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" onClick={() => setCatEdit({ id: c.id, name: c.name, coaCode: c.coaCode })} className="bil-row-btn mr-3">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => run(async () => { unwrap(await deleteAllocCategory(c.id)) })}
                      disabled={isPending}
                      aria-label={`Delete ${c.name}`}
                      className="text-muted hover:text-danger text-sm disabled:opacity-40"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              {data.categories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted text-sm">No categories yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {catEdit ? (
          <div className="fin-form">
            <div className="fin-field">
              <label htmlFor="alloc-cat-name">Name</label>
              <input id="alloc-cat-name" value={catEdit.name} onChange={(e) => setCatEdit({ ...catEdit, name: e.target.value })} />
            </div>
            <div className="fin-field span-2">
              <span className="fin-label">COA account (optional — type to search, click to pick)</span>
              <AccountPicker
                accounts={data.coaAccounts}
                value={catEdit.coaCode}
                onChange={(code) => setCatEdit({ ...catEdit, coaCode: code })}
                name="coa_code"
                placeholder="Search an account code or name…"
              />
            </div>
            <div className="span-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => run(async () => { unwrap(await saveAllocCategory(catEdit)); setCatEdit(null) })}
                disabled={isPending || !catEdit.name.trim()}
                className="bil-btn primary"
              >
                Save
              </button>
              <button type="button" onClick={() => setCatEdit(null)} className="text-sm text-graphite hover:text-ink">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setCatEdit({ name: '', coaCode: '' })} className="bil-btn">
            + Add category
          </button>
        )}
      </section>

      {/* ── Templates ── */}
      <section>
        <div className="sect-head">
          <h2>Templates</h2>
          <span className="rule" aria-hidden />
          <span className="count">{data.templates.length}</span>
        </div>
        <div className="overflow-x-auto mb-3">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th>Name</th>
                <th className="m-hide">Method</th>
                <th className="text-right right">Default RM</th>
                <th className="m-hide">Category</th>
                <th className="m-hide">Split %</th>
                <th className="m-hide">Status</th>
                <th className="m-hide" aria-label="Actions" />
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {data.templates.map((t) => (
                // On a phone the row folds; its arrow opens the rest (LedgerRow).
                <LedgerRow key={t.id}>
                  <td>{t.name}</td>
                  <td className="m-hide" data-label="Method">{METHOD[t.method] ?? t.method}</td>
                  <td className="num">{t.amount > 0 ? t.amount.toLocaleString('en-MY', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td className="m-hide" data-label="Category">{data.categories.find((c) => c.id === t.categoryId)?.name ?? '—'}</td>
                  <td className="m-hide text-graphite" data-label="Split %">
                    {t.splits.length > 0 ? t.splits.map((s) => `${companyLabel(s.companyId)} ${s.pct}%`).join(' · ') : '—'}
                  </td>
                  <td className="m-hide" data-label="Status">
                    <Chip label={t.status} tone={t.status === 'active' ? 'ledger' : 'info'} />
                  </td>
                  <td className="m-hide text-right whitespace-nowrap" data-label="Actions">
                    <button type="button" onClick={() => startTpl(t)} className="bil-row-btn mr-3">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => run(async () => { unwrap(await deleteAllocTemplate(t.id)) })}
                      disabled={isPending}
                      aria-label={`Delete ${t.name}`}
                      className="text-muted hover:text-danger text-sm disabled:opacity-40"
                    >
                      ×
                    </button>
                  </td>
                </LedgerRow>
              ))}
              {data.templates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-muted text-sm">No templates yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {tplEdit ? (
          <div className="fin-form">
            <div className="fin-field">
              <label htmlFor="alloc-tpl-name">Name</label>
              <input id="alloc-tpl-name" value={tplEdit.name} onChange={(e) => setTplEdit({ ...tplEdit, name: e.target.value })} />
            </div>
            <div className="fin-field">
              <label htmlFor="alloc-tpl-method">Method</label>
              <select id="alloc-tpl-method" value={tplEdit.method} onChange={(e) => setTplEdit({ ...tplEdit, method: e.target.value as AllocMethod })}>
                <option value="headcount">Headcount</option>
                <option value="percentage">Percentage</option>
                <option value="equal">Equal</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="fin-field">
              <label htmlFor="alloc-tpl-amount">Default RM</label>
              <input
                id="alloc-tpl-amount"
                type="number" step="0.01" min="0"
                value={tplEdit.amount}
                onChange={(e) => setTplEdit({ ...tplEdit, amount: e.target.value })}
                className="font-mono tabular text-right"
              />
            </div>
            <div className="fin-field">
              <label htmlFor="alloc-tpl-cat">Category</label>
              <select id="alloc-tpl-cat" value={tplEdit.categoryId} onChange={(e) => setTplEdit({ ...tplEdit, categoryId: e.target.value })}>
                <option value="">—</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {tplEdit.method === 'percentage' ? (
              <div className="span-3">
                <div className="text-[11.5px] font-medium text-graphite mb-1.5">Each company’s default %</div>
                <div className="flex flex-wrap gap-2">
                  {data.companies.map((c) => (
                    <label key={c.id} className="flex items-center gap-1.5 bg-paper border border-hairline rounded-md px-2 py-1">
                      <span className="text-xs text-graphite">{c.label}</span>
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
            <div className="span-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    unwrap(await saveAllocTemplate({
                      id: tplEdit.id,
                      name: tplEdit.name,
                      method: tplEdit.method,
                      amount: parseFloat(tplEdit.amount) || 0,
                      categoryId: tplEdit.categoryId || null,
                      status: tplEdit.status,
                      splits: Object.entries(tplEdit.pct)
                        .map(([companyId, v]) => ({ companyId, pct: parseFloat(v) || 0 }))
                        .filter((x) => x.pct > 0),
                    }))
                    setTplEdit(null)
                  })
                }
                disabled={isPending || !tplEdit.name.trim()}
                className="bil-btn primary"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setTplEdit(null)} className="text-sm text-graphite hover:text-ink">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => startTpl()} className="bil-btn">
            + Add template
          </button>
        )}
      </section>
    </div>
  )
}
