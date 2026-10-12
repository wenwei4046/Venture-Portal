'use client'

import { useEffect, useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import {
  saveAllocStaff, deleteAllocStaff, saveAllocSnapshot, importAllocStaffFromHr,
  getAllocSnapshot,
  type StaffSplitInput, type SnapshotDetailRow,
} from '../actions'
import type { AllocatorData, StaffRow } from './types'
import { unwrap } from './unwrap'

// The allocator's Staff (2026-10-10, the handoff, in English): "Staff · N
// PEOPLE" — everyone in one sortable table, the status as a chip, the splits
// as text, the date added — with the list's own functions as English actions
// above it: + Add person (the editor dialog, user 2026-08-01 "pop out"), Save
// the month's snapshot, the saved snapshots (each opens its review), Import
// from HR. Inactive people stay in the list with their chip; ▽ on Status
// narrows it (the old "Show inactive" toggle).

const OWN = '__own__' // select sentinel for "HOUZS Venture (own)" — DB stores NULL

interface EditState {
  id?: string
  name: string
  status: 'active' | 'inactive'
  department: string
  /** targetId: OWN sentinel, company uuid, or `dept:<uuid>`. */
  splits: { key: number; targetId: string; pct: string }[]
}

const monthName = (period: string) => dayjs(`${period}-01`).format('MMMM YYYY')
const monthShort = (period: string) => dayjs(`${period}-01`).format('MMM YYYY')

/** "HC 40% · HM 30% · HV own 30%", or "no splits". */
function splitsText(splits: Array<{ label: string; pct: number }>): string {
  return splits.length > 0 ? splits.map((x) => `${x.label} ${x.pct}%`).join(' · ') : 'no splits'
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${status === 'active' ? 'ledger' : 'info'}`}>
      <i className="dot" />
      {status}
    </span>
  )
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
  // Snapshot review: a saved month's per-company totals and the list as it stood.
  const [snapView, setSnapView] = useState<{
    period: string
    rows: SnapshotDetailRow[]
    savedAt: string | null
  } | null>(null)
  const [snapSearch, setSnapSearch] = useState('')

  const labelOfTarget = (targetId: string | null): string => {
    if (targetId === null) return 'HV own'
    // companySettings covers switched-off companies too, so old snapshots
    // keep their labels.
    return (
      data.companySettings.find((c) => c.id === targetId)?.label ??
      data.companies.find((c) => c.id === targetId)?.label ??
      data.departments.find((d) => d.id === targetId)?.label ??
      '?'
    )
  }
  const splitsOf = (s: StaffRow) => splitsText(s.splits.map((x) => ({ label: x.targetId === null ? 'HV own' : x.label, pct: x.pct })))

  const openSnapshot = (period: string) => {
    setError(null)
    setSnapSearch('')
    startTransition(async () => {
      try {
        const { rows, savedAt } = unwrap(await getAllocSnapshot(period))
        setSnapView({ period, rows, savedAt })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Load failed')
      }
    })
  }

  // The editor is a dialog; Esc closes it.
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
      unwrap(await saveAllocStaff({
        id: edit.id, name: edit.name, status: edit.status, department: edit.department, splits,
      }))
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

  const columns: SortableColumn<StaffRow>[] = [
    {
      key: 'name',
      label: 'Name',
      mobile: 'keep',
      filterable: true,
      render: (s) => (
        <>
          <span className="text-ink">{s.name}</span>
          {/* The phone's small print: the department, then the status. */}
          <span className="q-sub md:hidden">
            <span className="q-sub-no">{s.department || '—'}</span>
            <span className="q-sub-by">
              <span className="by"><StatusChip status={s.status} /></span>
            </span>
          </span>
        </>
      ),
      sortValue: (s) => s.name,
      filterValue: (s) => s.name,
    },
    {
      key: 'department',
      label: 'Department',
      mobile: 'detail',
      filterable: true,
      render: (s) => s.department || <span className="text-muted">—</span>,
      sortValue: (s) => s.department,
    },
    {
      key: 'status',
      label: 'Status',
      mobile: 'detail',
      filterable: true,
      render: (s) => <StatusChip status={s.status} />,
      sortValue: (s) => s.status,
    },
    {
      key: 'splits',
      label: 'Splits',
      mobile: 'detail',
      filterable: true,
      render: (s) => <span className={s.splits.length === 0 ? 'text-muted' : undefined}>{splitsOf(s)}</span>,
      sortValue: (s) => splitsOf(s),
    },
    {
      key: 'added',
      label: 'Added',
      mobile: 'detail',
      filterable: true,
      range: 'date',
      render: (s) => (s.createdAt ? officeTime(s.createdAt).format('D MMM YYYY') : <span className="text-muted">—</span>),
      sortValue: (s) => (s.createdAt ? new Date(s.createdAt) : null),
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'actions',
      pinned: 'end',
      label: '',
      sortable: false,
      resizable: false,
      mobile: 'detail',
      render: (s) => (
        <span className="flex items-center justify-end gap-3 whitespace-nowrap">
          <button type="button" onClick={() => startEdit(s)} className="bil-row-btn">
            Edit
          </button>
          <button
            type="button"
            onClick={() => run(async () => { unwrap(await deleteAllocStaff(s.id)) })}
            disabled={isPending}
            aria-label={`Delete ${s.name}`}
            title="Remove from the list"
            className="text-muted hover:text-danger text-sm disabled:opacity-40"
          >
            ×
          </button>
        </span>
      ),
    },
  ]

  return (
    <div className="alloc-sheet fin-queue">
      {/* The list's own actions (in English since 2026-10-10). */}
      <div className="fin-actions mb-4">
        <button type="button" onClick={() => startEdit()} className="btn-pri">
          + Add person
        </button>
        <button
          type="button"
          onClick={() => run(async () => { unwrap(await saveAllocSnapshot(data.period)) })}
          disabled={isPending}
          className="btn-sec"
        >
          Save {monthName(data.period)} snapshot
        </button>
        {data.hrPeriods.length > 0 ? (
          <span className="bil-inline">
            <label htmlFor="alloc-hr-month">Import from HR</label>
            <select
              id="alloc-hr-month"
              value={hrMonth}
              onChange={(e) => { setHrMonth(e.target.value); setConfirmImport(false) }}
            >
              {data.hrPeriods.map((p) => (
                <option key={p} value={p}>{monthName(p)}</option>
              ))}
            </select>
            {confirmImport ? (
              <>
                <span className="text-danger text-sm">This replaces the whole list —</span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmImport(false)
                    run(async () => {
                      const { imported } = unwrap(await importAllocStaffFromHr(hrMonth))
                      setNotice(`Imported ${imported} people (HR ${monthName(hrMonth)}); from now on it is your own copy — HR’s later changes do not follow.`)
                    })
                  }}
                  disabled={isPending}
                  className="btn-pri"
                >
                  Import
                </button>
                <button type="button" onClick={() => setConfirmImport(false)} className="btn-sec">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmImport(true)} disabled={isPending} className="btn-sec">
                {isPending ? 'Importing…' : 'Import HR list'}
              </button>
            )}
          </span>
        ) : null}
        <span className="bil-snapshots">
          Snapshots
          {data.snapshotPeriods.length > 0 ? (
            data.snapshotPeriods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => openSnapshot(p)}
                disabled={isPending}
                title="That month's snapshot: each company's heads and the list"
                className="bil-row-btn"
              >
                {monthShort(p)} →
              </button>
            ))
          ) : (
            <span className="text-muted">none yet</span>
          )}
        </span>
      </div>

      {notice ? <div className="bil-notice">{notice}</div> : null}

      {error ? (
        <div className="mb-4 bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div>
      ) : null}

      <section className="mb-6">
        <div className="sect-head">
          <h2>Staff</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {data.staff.length} {data.staff.length === 1 ? 'PERSON' : 'PEOPLE'}
          </span>
        </div>
        <SortableTable<StaffRow>
          layoutId="billing-allocator.staff"
          layoutTitle="Staff"
          canSetDefault
          scrollBox
          resizeMode="neighbour"
          rows={data.staff}
          getRowKey={(s) => s.id}
          defaultSort={{ key: 'added', dir: 'desc' }}
          searchKeys={['name', 'department', 'splits']}
          searchPlaceholder="Search name / department / company…"
          columns={columns}
          emptyState={<span className="text-muted text-sm">The list is empty — add people so Headcount has someone to count.</span>}
        />
      </section>

      {/* The editor — a dialog; the backdrop or Esc cancels. */}
      {edit ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/45 backdrop-blur-sm"
          {...backdropDismiss(() => setEdit(null))}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={edit.id ? `Editing — ${edit.name || '…'}` : 'Add a person'}
            className="bg-paper border border-hairline rounded-panel shadow-xl max-w-2xl w-[92vw] max-h-[85vh] overflow-y-auto p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-lg text-ink">{edit.id ? <>Editing — {edit.name || '…'}</> : 'Add a person'}</h3>
            <div className="fin-form">
              <div className="fin-field">
                <label htmlFor="alloc-staff-name">Name</label>
                <input id="alloc-staff-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              </div>
              <div className="fin-field">
                <label htmlFor="alloc-staff-dept">Department</label>
                <input
                  id="alloc-staff-dept"
                  value={edit.department}
                  onChange={(e) => setEdit({ ...edit, department: e.target.value })}
                  list="alloc-departments"
                  placeholder="e.g. Marketing / CS / Admin"
                />
                <datalist id="alloc-departments">
                  {departmentOptions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div className="fin-field">
                <label htmlFor="alloc-staff-status">Status</label>
                <select
                  id="alloc-staff-status"
                  value={edit.status}
                  onChange={(e) => setEdit({ ...edit, status: e.target.value as 'active' | 'inactive' })}
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>
              <div className="span-3">
                <div className="text-[11.5px] font-medium text-graphite mb-1.5">
                  Splits · total {totalPct}%{totalPct > 100 ? ' — over 100' : ''}
                </div>
                <div className="space-y-2">
                  {edit.splits.map((sp) => (
                    <div key={sp.key} className="flex items-center gap-2">
                      <select
                        aria-label="Bill to"
                        value={sp.targetId}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            splits: edit.splits.map((x) => (x.key === sp.key ? { ...x, targetId: e.target.value } : x)),
                          })
                        }
                        className="px-2.5 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink"
                      >
                        <option value={OWN}>HOUZS Venture (own)</option>
                        {data.companies.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                        {data.departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                        {/* Switched-off companies this person still references —
                            keep the option so editing doesn't silently drop it. */}
                        {data.companySettings
                          .filter((c) => !c.enabled && edit.splits.some((x) => x.targetId === c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>{c.label} (switched off)</option>
                          ))}
                      </select>
                      <input
                        aria-label="Share %"
                        type="number" step="0.01" min="0" max="100"
                        value={sp.pct}
                        onChange={(e) =>
                          setEdit({
                            ...edit,
                            splits: edit.splits.map((x) => (x.key === sp.key ? { ...x, pct: e.target.value } : x)),
                          })
                        }
                        className="w-24 px-2.5 py-1.5 bg-paper border border-hairline rounded-md text-sm text-right font-mono tabular"
                      />
                      <span className="text-xs text-muted">%</span>
                      <button
                        type="button"
                        aria-label="Remove this split"
                        onClick={() => setEdit({ ...edit, splits: edit.splits.filter((x) => x.key !== sp.key) })}
                        className="text-muted hover:text-danger px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setEdit({ ...edit, splits: [...edit.splits, { key: nextKey, targetId: OWN, pct: '' }] }); setNextKey((k) => k + 1) }}
                    className="btn-sec"
                  >
                    + Add a split
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={submit}
                disabled={isPending || !edit.name.trim() || totalPct > 100}
                className="bil-btn primary"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setEdit(null)} className="text-sm text-graphite hover:text-ink">
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* A saved snapshot's review */}
      {snapView ? (() => {
        // Active rows drive the totals — exactly what a calc on this snapshot
        // would use. The list shows everyone, inactive greyed.
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
            const hay = [name, info.department, ...info.splits.map((sp) => labelOfTarget(sp.targetId))].join(' ').toLowerCase()
            return hay.includes(q)
          })
          .sort((a, b) => Number(a[1].status !== 'active') - Number(b[1].status !== 'active') || a[0].localeCompare(b[0]))
        const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/45 backdrop-blur-sm"
            {...backdropDismiss(() => setSnapView(null))}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Snapshot · ${monthName(snapView.period)}`}
              className="bg-paper border border-hairline rounded-panel shadow-xl max-w-3xl w-[92vw] max-h-[85vh] overflow-y-auto p-5 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="font-serif text-lg text-ink">
                  Snapshot · {monthName(snapView.period)}
                  {snapView.savedAt ? (
                    <span className="ml-2 font-sans text-xs text-muted">saved {officeTime(snapView.savedAt).format('D MMM YYYY HH:mm')}</span>
                  ) : null}
                </h3>
                <button type="button" onClick={() => setSnapView(null)} aria-label="Close" className="text-muted hover:text-danger text-sm">
                  ×
                </button>
              </div>

              <div>
                <div className="bil-dlg-label">By company · {totalHeads.toFixed(2)} heads</div>
                <table className="ledger-table w-full">
                  <thead>
                    <tr>
                      <th>Bill to</th>
                      <th className="text-right right">Heads</th>
                      <th className="text-right right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(totals.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([targetId, heads]) => (
                        <tr key={targetId ?? 'own'} className={targetId === null ? 'own' : undefined}>
                          <td>{labelOfTarget(targetId)}</td>
                          <td className="num">{heads.toFixed(2)}</td>
                          <td className="num">{totalHeads > 0 ? ((heads / totalHeads) * 100).toFixed(1) : '0.0'}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="bil-dlg-label">
                  List · {people(roster.length)}
                  {q ? ` of ${byStaff.size}` : ''}
                </div>
                <input
                  type="search"
                  value={snapSearch}
                  onChange={(e) => setSnapSearch(e.target.value)}
                  placeholder="Search name / department / company…"
                  className="search-plain mb-2 px-2.5 py-1 bg-paper border border-hairline rounded-md text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent-border w-64"
                />
                <div className="divide-y divide-hairline border border-hairline rounded-md">
                  {roster.length === 0 ? <div className="px-3 py-3 text-muted text-sm">Nothing found.</div> : null}
                  {roster.map(([name, info]) => (
                    <div key={name} className={`px-3 py-2 flex items-center gap-3 flex-wrap ${info.status !== 'active' ? 'opacity-50' : ''}`}>
                      <span className="text-ink min-w-[10rem]">{name}</span>
                      {info.department ? <span className="text-xs text-graphite">{info.department}</span> : null}
                      <StatusChip status={info.status} />
                      <span className="text-xs text-graphite">
                        {splitsText(info.splits.map((sp) => ({ label: labelOfTarget(sp.targetId), pct: sp.pct })))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })() : null}
    </div>
  )
}
