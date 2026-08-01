'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import {
  saveAllocStaff, deleteAllocStaff, saveAllocSnapshot, importAllocStaffFromHr,
  getAllocSnapshot,
  type StaffSplitInput, type SnapshotDetailRow,
} from '../actions'
import type { AllocatorData, StaffRow } from './types'

const OWN = '__own__' // select sentinel for "HOUZS Venture (own)" — DB stores NULL

const inputCls =
  'px-2.5 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'

interface EditState {
  id?: string
  name: string
  status: 'active' | 'inactive'
  department: string
  /** targetId: OWN sentinel, company uuid, or `dept:<uuid>`. */
  splits: { key: number; targetId: string; pct: string }[]
}

export default function StaffTab({ data }: { data: AllocatorData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [nextKey, setNextKey] = useState(1000)
  const [hrMonth, setHrMonth] = useState(data.hrPeriods[0] ?? '')
  const [confirmImport, setConfirmImport] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Default view is ACTIVE only; a toggle reveals the inactive people.
  const [showInactive, setShowInactive] = useState(false)
  // Snapshot review modal: click a saved period to see its per-company share
  // totals + the roster as it stood.
  const [snapView, setSnapView] = useState<{
    period: string
    rows: SnapshotDetailRow[]
    savedAt: string | null
  } | null>(null)
  const [snapSearch, setSnapSearch] = useState('')

  const labelOfTarget = (targetId: string | null): string => {
    if (targetId === null) return 'HV own'
    return (
      data.companies.find((c) => c.id === targetId)?.label ??
      data.departments.find((d) => d.id === targetId)?.label ??
      '?'
    )
  }

  const openSnapshot = (period: string) => {
    setError(null)
    setSnapSearch('')
    startTransition(async () => {
      try {
        const { rows, savedAt } = await getAllocSnapshot(period)
        setSnapView({ period, rows, savedAt })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Load failed')
      }
    })
  }

  // The editor is a MODAL (user 2026-08-01: "我希望是pop out 出来…而不是跳上去")
  // — same overlay pattern as BatchDetailsModal. Esc closes.
  useEffect(() => {
    if (!edit) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEdit(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit])

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
            department: s.department,
            splits: s.splits.map((x, i) => ({ key: i, targetId: x.targetId ?? OWN, pct: String(x.pct) })),
          }
        : { name: '', status: 'active', department: '', splits: [{ key: 0, targetId: OWN, pct: '100' }] },
    )
  }

  const submit = () => {
    if (!edit) return
    const splits: StaffSplitInput[] = edit.splits
      .map((s) => ({ targetId: s.targetId === OWN ? null : s.targetId, pct: parseFloat(s.pct) || 0 }))
      .filter((s) => s.pct > 0)
    run(async () => {
      await saveAllocStaff({
        id: edit.id, name: edit.name, status: edit.status, department: edit.department, splits,
      })
      setEdit(null)
    })
  }

  // Existing labels feed the editor's datalist so spellings stay consistent.
  const departmentOptions = Array.from(
    new Set(data.staff.map((s) => s.department).filter(Boolean)),
  ).sort()

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

      {/* Import from HR's allocation table */}
      {data.hrPeriods.length > 0 ? (
        <div className="flex items-center gap-3 flex-wrap border border-hairline rounded-md bg-surface p-3">
          <span className="text-xs uppercase tracking-wide text-muted font-sans">从 HR 带入</span>
          <select value={hrMonth} onChange={(e) => { setHrMonth(e.target.value); setConfirmImport(false) }} className={inputCls}>
            {data.hrPeriods.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {confirmImport ? (
            <span className="flex items-center gap-2">
              <span className="font-serif italic text-danger text-sm">会把现在的名单整个换掉 —</span>
              <button
                type="button"
                onClick={() => {
                  setConfirmImport(false)
                  run(async () => {
                    const { imported } = await importAllocStaffFromHr(hrMonth)
                    setNotice(`带入 ${imported} 人(HR ${hrMonth});之后是你的独立副本,HR 改了不会自动跟。`)
                  })
                }}
                disabled={isPending}
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                确定带入
              </button>
              <button type="button" onClick={() => setConfirmImport(false)} className="text-sm text-graphite hover:text-ink font-sans">
                算了
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmImport(true)}
              disabled={isPending}
              className="bg-surface-2 hover:bg-paper border border-hairline text-ink font-serif italic text-sm px-3.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {isPending ? '带入中…' : '带入 HR 名单'}
            </button>
          )}
          <span className="font-serif italic text-muted text-xs">
            HR 没分满 100% 的,差额自动记成 HV own。
          </span>
        </div>
      ) : null}

      {notice ? (
        <div className="border border-accent-border bg-accent-bg rounded-md p-3 font-serif italic text-sm text-ink">{notice}</div>
      ) : null}

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
        <span className="font-mono text-xs text-muted">已有快照:</span>
        {data.snapshotPeriods.length > 0 ? (
          data.snapshotPeriods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => openSnapshot(p)}
              disabled={isPending}
              title="看这个月的快照:各公司合计 + 名单"
              className="px-2 py-0.5 bg-paper border border-hairline rounded-md font-mono text-xs text-accent hover:text-accent-hover hover:border-accent-border transition-colors disabled:opacity-50"
            >
              {p} →
            </button>
          ))
        ) : (
          <span className="font-mono text-xs text-muted">无</span>
        )}
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      {/* Editor — modal popup; overlay click or Esc cancels. */}
      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setEdit(null)}
        >
        <div
          className="bg-paper border border-hairline rounded-lg shadow-xl max-w-2xl w-[92vw] max-h-[85vh] overflow-y-auto p-5 space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-serif italic text-accent text-sm">
            {edit.id ? <>正在编辑 — <span className="text-ink">{edit.name || '…'}</span></> : '加人'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-sans text-graphite mb-1">Name *</label>
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="block text-xs font-sans text-graphite mb-1">Department</label>
              <input
                value={edit.department}
                onChange={(e) => setEdit({ ...edit, department: e.target.value })}
                list="alloc-departments"
                placeholder="e.g. Marketing / CS / Admin"
                className={`${inputCls} w-full`}
              />
              <datalist id="alloc-departments">
                {departmentOptions.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
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
                    value={sp.targetId}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        splits: edit.splits.map((x) => (x.key === sp.key ? { ...x, targetId: e.target.value } : x)),
                      })
                    }
                    className={inputCls}
                  >
                    <option value={OWN}>HOUZS Venture (own)</option>
                    {data.companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                    {data.departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
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
                onClick={() => { setEdit({ ...edit, splits: [...edit.splits, { key: nextKey, targetId: OWN, pct: '' }] }); setNextKey((k) => k + 1) }}
                className="text-sm text-accent hover:text-accent-hover font-serif italic"
              >
                + 加一个对象
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
        </div>
      ) : null}

      {/* Snapshot review modal */}
      {snapView ? (() => {
        // Active rows drive the totals — exactly what a calc on this snapshot
        // would use. Roster shows everyone, inactive greyed.
        const active = snapView.rows.filter((r) => r.status === 'active' && r.pct > 0)
        const totals = new Map<string | null, number>()
        for (const r of active) totals.set(r.targetId, (totals.get(r.targetId) ?? 0) + r.pct / 100)
        const totalHeads = Array.from(totals.values()).reduce((a, b) => a + b, 0)
        const byStaff = new Map<string, { status: string; department: string; splits: { targetId: string | null; pct: number }[] }>()
        for (const r of snapView.rows) {
          if (!byStaff.has(r.staffName)) byStaff.set(r.staffName, { status: r.status, department: r.department, splits: [] })
          if (r.pct > 0) byStaff.get(r.staffName)!.splits.push({ targetId: r.targetId, pct: r.pct })
        }
        // Same search reach as the live list: name / department / split labels.
        const q = snapSearch.trim().toLowerCase()
        const roster = Array.from(byStaff.entries())
          .filter(([name, info]) => {
            if (!q) return true
            const hay = [
              name,
              info.department,
              ...info.splits.map((sp) => labelOfTarget(sp.targetId)),
            ].join(' ').toLowerCase()
            return hay.includes(q)
          })
          .sort(
            (a, b) => Number(a[1].status !== 'active') - Number(b[1].status !== 'active') || a[0].localeCompare(b[0]),
          )
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onClick={() => setSnapView(null)}
          >
            <div
              className="bg-paper border border-hairline rounded-lg shadow-xl max-w-3xl w-[92vw] max-h-[85vh] overflow-y-auto p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="font-serif text-lg text-ink">
                  快照 · {snapView.period}
                  {snapView.savedAt ? (
                    <span className="ml-2 font-mono text-xs text-muted">
                      存于 {dayjs(snapView.savedAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  ) : null}
                </div>
                <button type="button" onClick={() => setSnapView(null)} className="text-muted hover:text-danger font-mono text-sm">
                  ×
                </button>
              </div>

              <div>
                <div className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent mb-2">
                  各公司合计(active,{totalHeads.toFixed(2)} 人头)
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(totals.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([targetId, heads]) => (
                      <span
                        key={targetId ?? 'own'}
                        className={`px-2.5 py-1 rounded-md border font-mono tabular text-sm ${
                          targetId === null
                            ? 'bg-surface text-muted border-hairline italic'
                            : 'bg-accent-bg text-ink border-accent-border'
                        }`}
                      >
                        {labelOfTarget(targetId)} · {heads.toFixed(2)} 头
                        <span className="text-muted text-xs">
                          {' '}({totalHeads > 0 ? ((heads / totalHeads) * 100).toFixed(1) : '0.0'}%)
                        </span>
                      </span>
                    ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div className="font-sans text-[10.5px] font-semibold uppercase tracking-[0.18em] text-accent">
                    名单({roster.length}{q ? ` / ${byStaff.size}` : ''} 人)
                  </div>
                  <input
                    type="search"
                    value={snapSearch}
                    onChange={(e) => setSnapSearch(e.target.value)}
                    placeholder="搜名字 / 部门 / 公司…"
                    className="search-plain px-2.5 py-1 bg-paper border border-hairline rounded-md text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent-border w-56"
                  />
                </div>
                <div className="divide-y divide-hairline border border-hairline rounded-md">
                  {roster.length === 0 ? (
                    <div className="px-3 py-3 font-serif italic text-muted text-sm">没找到。</div>
                  ) : null}
                  {roster.map(([name, info]) => (
                    <div key={name} className={`px-3 py-2 flex items-center gap-3 flex-wrap ${info.status !== 'active' ? 'opacity-50' : ''}`}>
                      <span className="font-serif text-md text-ink min-w-[10rem]">{name}</span>
                      {info.department ? (
                        <span className="px-1.5 py-0.5 bg-surface-2 rounded font-mono text-[9px] uppercase text-graphite">
                          {info.department}
                        </span>
                      ) : null}
                      <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] uppercase ${
                        info.status === 'active' ? 'bg-accent-bg text-ink' : 'bg-surface-2 text-muted'
                      }`}>
                        {info.status}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {info.splits.map((sp, i) => (
                          <span key={i} className={`px-1.5 py-0.5 rounded border font-mono text-[10px] ${
                            sp.targetId === null
                              ? 'bg-surface text-muted border-hairline italic'
                              : 'bg-accent-bg text-ink border-accent-border'
                          }`}>
                            {labelOfTarget(sp.targetId)} {sp.pct}%
                          </span>
                        ))}
                        {info.splits.length === 0 ? (
                          <span className="font-serif italic text-muted text-xs">no splits</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })() : null}

      <button type="button" onClick={() => startEdit()} className="text-sm text-accent hover:text-accent-hover font-serif italic">
        + 加人
      </button>

      {/* List — SortableTable: search, click-to-sort headers, newest first.
          Active only by default; the toggle reveals inactive. */}
      <SortableTable
        rows={showInactive ? data.staff : data.staff.filter((s) => s.status === 'active')}
        getRowKey={(s) => s.id}
        defaultSort={{ key: 'added', dir: 'desc' }}
        searchKeys={['name', 'department', 'splits']}
        searchPlaceholder="搜名字 / 部门 / 公司…"
        toolbarRight={
          <span className="flex items-center gap-3 whitespace-nowrap">
            <span className="font-mono text-xs text-muted">
              <span className="text-ledger font-semibold">
                Active {data.staff.filter((s) => s.status === 'active').length}
              </span>
              {' · '}Inactive {data.staff.filter((s) => s.status === 'inactive').length}
              {' · '}共 {data.staff.length} 人
            </span>
            {data.staff.some((s) => s.status === 'inactive') ? (
              <button
                type="button"
                onClick={() => setShowInactive((v) => !v)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
                  showInactive
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-surface text-graphite border-hairline hover:text-ink'
                }`}
              >
                {showInactive ? '只看 Active' : '显示 Inactive'}
              </button>
            ) : null}
          </span>
        }
        columns={staffColumns(startEdit, (id) => run(() => deleteAllocStaff(id)), isPending)}
        emptyState={
          <div className="font-serif italic text-muted text-sm p-4">
            名单还是空的 — 加人后 Headcount 法才有数。
          </div>
        }
      />
    </div>
  )
}

function staffColumns(
  onEdit: (s: StaffRow) => void,
  onDelete: (id: string) => void,
  isPending: boolean,
): SortableColumn<StaffRow>[] {
  return [
    {
      key: 'name',
      label: 'Name',
      render: (s) => s.name, // plain string → searchable directly
      cellClassName: 'font-serif text-md text-ink',
    },
    {
      key: 'department',
      label: 'Department',
      filterable: true,
      sortValue: (s) => s.department,
      render: (s) =>
        s.department ? (
          <span className="px-2 py-0.5 bg-surface-2 rounded-md font-mono text-[10px] uppercase text-graphite">
            {s.department}
          </span>
        ) : (
          <span className="text-muted text-xs">—</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      sortValue: (s) => s.status,
      filterable: true,
      render: (s) => (
        <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] uppercase ${
          s.status === 'active' ? 'bg-accent-bg text-ink' : 'bg-surface-2 text-muted'
        }`}>
          {s.status}
        </span>
      ),
    },
    {
      key: 'splits',
      label: 'Splits',
      // Text form feeds both search ("搜公司") and sort.
      sortValue: (s) =>
        s.splits.map((x) => (x.targetId === null ? 'HV own' : x.label)).join(' '),
      render: (s) => (
        <div className="flex flex-wrap gap-1.5 py-1">
          {s.splits.map((x, i) => (
            <span key={i} className={`px-2 py-0.5 rounded-md border text-xs font-mono ${
              x.targetId === null
                ? 'bg-surface text-muted border-hairline italic'
                : 'bg-accent-bg text-ink border-accent-border'
            }`}>
              {x.targetId === null ? 'HV own' : x.label} {x.pct}%
            </span>
          ))}
          {s.splits.length === 0 ? <span className="font-serif italic text-muted text-xs">no splits</span> : null}
        </div>
      ),
    },
    {
      key: 'added',
      label: 'Added',
      sortValue: (s) => (s.createdAt ? new Date(s.createdAt) : null),
      render: (s) => (
        <span className="font-mono text-xs text-graphite whitespace-nowrap">
          {s.createdAt ? dayjs(s.createdAt).format('YYYY-MM-DD') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      align: 'right',
      cellClassName: 'whitespace-nowrap',
      render: (s) => (
        <>
          <button
            type="button"
            onClick={() => onEdit(s)}
            className="text-accent hover:text-accent-hover font-serif italic text-sm mr-3"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(s.id)}
            disabled={isPending}
            className="text-muted hover:text-danger font-mono text-sm"
          >
            ×
          </button>
        </>
      ),
    },
  ]
}
