'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveAllocStaff, deleteAllocStaff, saveAllocSnapshot, type StaffSplitInput } from '../actions'
import type { AllocatorData, StaffRow } from './types'

const OWN = '__own__' // select sentinel for "HOUZS Venture (own)" — DB stores NULL

const inputCls =
  'px-2.5 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'

interface EditState {
  id?: string
  name: string
  status: 'active' | 'inactive'
  splits: { key: number; companyId: string; pct: string }[]
}

export default function StaffTab({ data }: { data: AllocatorData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [nextKey, setNextKey] = useState(1000)

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

  const startEdit = (s?: StaffRow) => {
    setEdit(
      s
        ? {
            id: s.id,
            name: s.name,
            status: s.status,
            splits: s.splits.map((x, i) => ({ key: i, companyId: x.companyId ?? OWN, pct: String(x.pct) })),
          }
        : { name: '', status: 'active', splits: [{ key: 0, companyId: OWN, pct: '100' }] },
    )
  }

  const submit = () => {
    if (!edit) return
    const splits: StaffSplitInput[] = edit.splits
      .map((s) => ({ companyId: s.companyId === OWN ? null : s.companyId, pct: parseFloat(s.pct) || 0 }))
      .filter((s) => s.pct > 0)
    run(async () => {
      await saveAllocStaff({ id: edit.id, name: edit.name, status: edit.status, splits })
      setEdit(null)
    })
  }

  const totalPct = edit
    ? Math.round(edit.splits.reduce((s, x) => s + (parseFloat(x.pct) || 0), 0) * 100) / 100
    : 0

  return (
    <div className="space-y-6">
      <p className="font-serif italic text-muted text-sm max-w-3xl">
        Finance 自己维护的名单(跟 HR 的无关)。每人可跨公司挂 %,
        「HOUZS Venture (own)」那份算 HV 自己的、不开单。
        名单一改,本月快照自动更新;算旧月份要先存那个月的快照。
      </p>

      {/* Snapshot controls */}
      <div className="flex items-center gap-3 flex-wrap border border-hairline rounded-md bg-surface p-3">
        <button
          type="button"
          onClick={() => run(() => saveAllocSnapshot(data.period))}
          disabled={isPending}
          className="bg-surface-2 hover:bg-paper border border-hairline text-ink font-serif italic text-sm px-3.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
        >
          存 {data.period} 快照
        </button>
        <span className="font-mono text-xs text-muted">
          已有快照:{data.snapshotPeriods.length > 0 ? data.snapshotPeriods.join(' · ') : '无'}
        </span>
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      {/* List */}
      <div className="overflow-x-auto border border-hairline rounded-md">
        <table className="ledger-table w-full">
          <thead>
            <tr><th>Name</th><th>Status</th><th>Splits</th><th></th></tr>
          </thead>
          <tbody>
            {data.staff.map((s) => (
              <tr key={s.id}>
                <td className="font-serif text-md text-ink">{s.name}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] uppercase ${
                    s.status === 'active' ? 'bg-accent-bg text-ink' : 'bg-surface-2 text-muted'
                  }`}>
                    {s.status}
                  </span>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {s.splits.map((x, i) => (
                      <span key={i} className={`px-2 py-0.5 rounded-md border text-xs font-mono ${
                        x.companyId === null
                          ? 'bg-surface text-muted border-hairline italic'
                          : 'bg-accent-bg text-ink border-accent-border'
                      }`}>
                        {x.companyId === null ? 'HV own' : data.companies.find((c) => c.id === x.companyId)?.label ?? '?'} {x.pct}%
                      </span>
                    ))}
                    {s.splits.length === 0 ? <span className="font-serif italic text-muted text-xs">no splits</span> : null}
                  </div>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button type="button" onClick={() => startEdit(s)} className="text-accent hover:text-accent-hover font-serif italic text-sm mr-3">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => deleteAllocStaff(s.id))}
                    disabled={isPending}
                    className="text-muted hover:text-danger font-mono text-sm"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {data.staff.length === 0 ? (
              <tr><td colSpan={4} className="font-serif italic text-muted text-sm">名单还是空的 — 加人后 Headcount 法才有数。</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Editor */}
      {edit ? (
        <div className="border border-accent-border bg-accent-bg rounded-md p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-sans text-graphite mb-1">Name *</label>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="block text-xs font-sans text-graphite mb-1">Status</label>
              <select
                value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value as 'active' | 'inactive' })}
                className={`${inputCls} w-full`}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
          </div>
          <div>
            <div className="text-xs font-sans text-graphite mb-1.5">
              Splits(合计 {totalPct}%{totalPct > 100 ? ' — 超过 100 了' : ''})
            </div>
            <div className="space-y-2">
              {edit.splits.map((sp) => (
                <div key={sp.key} className="flex items-center gap-2">
                  <select
                    value={sp.companyId}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        splits: edit.splits.map((x) => (x.key === sp.key ? { ...x, companyId: e.target.value } : x)),
                      })
                    }
                    className={inputCls}
                  >
                    <option value={OWN}>HOUZS Venture (own)</option>
                    {data.companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    value={sp.pct}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        splits: edit.splits.map((x) => (x.key === sp.key ? { ...x, pct: e.target.value } : x)),
                      })
                    }
                    className={`${inputCls} w-24 text-right font-mono tabular`}
                  />
                  <span className="text-xs text-muted">%</span>
                  <button
                    type="button"
                    onClick={() => setEdit({ ...edit, splits: edit.splits.filter((x) => x.key !== sp.key) })}
                    className="text-muted hover:text-danger font-mono px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => { setEdit({ ...edit, splits: [...edit.splits, { key: nextKey, companyId: OWN, pct: '' }] }); setNextKey((k) => k + 1) }}
                className="text-sm text-accent hover:text-accent-hover font-serif italic"
              >
                + 加一个公司
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !edit.name.trim() || totalPct > 100}
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setEdit(null)} className="text-sm text-graphite hover:text-ink font-sans">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => startEdit()} className="text-sm text-accent hover:text-accent-hover font-serif italic">
          + 加人
        </button>
      )}
    </div>
  )
}
