'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import {
  saveAllocStaff, deleteAllocStaff, saveAllocSnapshot, importAllocStaffFromHr,
  type StaffSplitInput,
} from '../actions'
import type { AllocatorData, StaffRow } from './types'

const OWN = '__own__' // select sentinel for "HOUZS Venture (own)" — DB stores NULL

const inputCls =
  'px-2.5 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border'

interface EditState {
  id?: string
  name: string
  status: 'active' | 'inactive'
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

  // The editor sits ABOVE the table (a 37-row list pushed it far below the
  // fold — clicking Edit looked like nothing happened, user 2026-08-01).
  // Scroll to it when a DIFFERENT row opens — keyed on identity, not the edit
  // object, which changes on every keystroke.
  const editorRef = useRef<HTMLDivElement>(null)
  const editKey = edit ? edit.id ?? 'new' : null
  useEffect(() => {
    if (editKey) editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [editKey])

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
            splits: s.splits.map((x, i) => ({ key: i, targetId: x.targetId ?? OWN, pct: String(x.pct) })),
          }
        : { name: '', status: 'active', splits: [{ key: 0, targetId: OWN, pct: '100' }] },
    )
  }

  const submit = () => {
    if (!edit) return
    const splits: StaffSplitInput[] = edit.splits
      .map((s) => ({ targetId: s.targetId === OWN ? null : s.targetId, pct: parseFloat(s.pct) || 0 }))
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
        <span className="font-mono text-xs text-muted">
          已有快照:{data.snapshotPeriods.length > 0 ? data.snapshotPeriods.join(' · ') : '无'}
        </span>
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      {/* Editor — ABOVE the table so opening it is always visible. */}
      {edit ? (
        <div ref={editorRef} className="border border-accent-border bg-accent-bg rounded-md p-4 space-y-3">
          <div className="font-serif italic text-accent text-sm">
            {edit.id ? <>正在编辑 — <span className="text-ink">{edit.name || '…'}</span></> : '加人'}
          </div>
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
      ) : (
        <button type="button" onClick={() => startEdit()} className="text-sm text-accent hover:text-accent-hover font-serif italic">
          + 加人
        </button>
      )}

      {/* List — SortableTable: search, click-to-sort headers, newest first. */}
      <SortableTable
        rows={data.staff}
        getRowKey={(s) => s.id}
        defaultSort={{ key: 'added', dir: 'desc' }}
        searchKeys={['name', 'splits']}
        searchPlaceholder="搜名字或公司…"
        toolbarRight={
          <span className="font-mono text-xs text-muted whitespace-nowrap">
            <span className="text-ledger font-semibold">
              Active {data.staff.filter((s) => s.status === 'active').length}
            </span>
            {' · '}Inactive {data.staff.filter((s) => s.status === 'inactive').length}
            {' · '}共 {data.staff.length} 人
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
