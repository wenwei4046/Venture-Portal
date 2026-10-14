'use client'

import { useMemo, useRef, useState } from 'react'
import { DialogButton, DialogConfirm, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { neededSentence, num } from '@/components/finv/form-words'
import { Select } from '@/components/hrv/select'
import { officeTime } from '@/lib/office-time'
import { deleteAllocStaff, importAllocStaffFromHr, saveAllocStaff, type SnapshotDetailRow } from '../actions'
import type { AllocatorData, StaffRow } from './types'
import a from './alloc.module.css'

// The allocator's Staff, its dialogs (2026-10-14, the Finance revamp v2 — D11;
// the design draws the list and its *Edit* / *+ Add staff*, not the forms, so
// they are the system's in the kit's sheet): a person — name, department,
// status and the splits that make their headcount (HV's own share, a company
// or a department, each a %, together no more than 100) — taken off the list
// from the same dialog; a saved month's snapshot to look back on; HR's list
// imported over the whole of Finance's, asked first.

const OWN = '__own__'
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthLong = (ym: string) => `${MONTH[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
const r2 = (n: number) => Math.round(n * 100) / 100

/** "HC 40% · HM 30% · HV own 30%", or "no splits". */
export function splitsText(splits: ReadonlyArray<{ label: string; pct: number }>): string {
  return splits.length > 0 ? splits.map((x) => `${x.label} ${x.pct}%`).join(' · ') : 'no splits'
}

interface SplitLine {
  key: number
  target: string
  pct: string
}

export function StaffDialog({
  open,
  onClose,
  onDone,
  data,
  person,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  data: AllocatorData
  /** Null: a new person. */
  person: StaffRow | null
}) {
  const keySeq = useRef(0)
  const nextKey = () => ++keySeq.current
  const [name, setName] = useState(person?.name ?? '')
  const [department, setDepartment] = useState(person?.department ?? '')
  const [status, setStatus] = useState<'active' | 'inactive'>(person?.status ?? 'active')
  const [splits, setSplits] = useState<SplitLine[]>(() =>
    person ? person.splits.map((x) => ({ key: nextKey(), target: x.targetId ?? OWN, pct: String(x.pct) })) : [{ key: nextKey(), target: OWN, pct: '100' }],
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = r2(splits.reduce((s, x) => s + num(x.pct), 0))
  const problem = neededSentence(name.trim() ? [] : ['a name']) ?? (total > 100 ? `The splits come to ${total}% — no more than 100%.` : null)
  const ok = problem === null
  // The departments already on the list, so the spellings stay one.
  const known = useMemo(() => Array.from(new Set(data.staff.map((s) => s.department).filter(Boolean))).sort(), [data.staff])
  // A company switched off that this person still names keeps its option, so editing does not drop it.
  const offStill = data.companySettings.filter((c) => !c.enabled && splits.some((x) => x.target === c.id))
  const setSplit = (key: number, patch: Partial<SplitLine>) => setSplits((prev) => prev.map((x) => (x.key === key ? { ...x, ...patch } : x)))

  const save = async () => {
    setTried(true)
    if (!ok || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await saveAllocStaff({
        id: person?.id,
        name,
        status,
        department,
        splits: splits.map((x) => ({ targetId: x.target === OWN ? null : x.target, pct: num(x.pct) })).filter((x) => x.pct > 0),
      })
      if (res.error) throw new Error(res.error)
      onDone(`${name.trim()} saved`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!person || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await deleteAllocStaff(person.id)
      if (res.error) throw new Error(res.error)
      onDone(`${person.name} removed from the list`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (confirming && person) {
    return (
      <FinDialog open={open} onClose={() => !busy && onClose()} title={`Remove ${person.name}?`} locked={busy}>
        <DialogConfirm
          text="They leave the list, and this month’s headcount snapshot is saved again without them."
          confirmLabel={busy ? 'Removing…' : 'Remove'}
          danger
          busy={busy}
          error={error}
          onCancel={() => {
            setConfirming(false)
            setError(null)
          }}
          onConfirm={remove}
        />
      </FinDialog>
    )
  }

  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title={person ? person.name : 'Add staff'} sub={person ? 'Staff · their splits make the headcount' : 'Staff · the headcount the allocator counts'} locked={busy}>
      <DialogForm
        onSubmit={save}
        buttons={
          <>
            {person ? (
              <DialogButton disabled={busy} onClick={() => setConfirming(true)} className={a.undo}>
                Remove
              </DialogButton>
            ) : null}
            <DialogButton disabled={busy} onClick={onClose}>
              Cancel
            </DialogButton>
            <DialogButton kind="primary" off={!ok} disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </DialogButton>
          </>
        }
      >
        <Field label="Name" htmlFor="alloc-staff-name">
          <Input id="alloc-staff-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </Field>
        <Field label="Department" htmlFor="alloc-staff-dept">
          <Input id="alloc-staff-dept" value={department} onChange={(e) => setDepartment(e.target.value)} list="alloc-staff-depts" placeholder="e.g. Marketing" />
        </Field>
        <Field label="Status" htmlFor="alloc-staff-status">
          <Select id="alloc-staff-status" round={12} className={fm.select} value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <datalist id="alloc-staff-depts">
          {known.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <Field label="Splits">
          <div className={fm.lines}>
            {splits.map((x, i) => (
              <div key={x.key} className={fm.lineWrap}>
                <div className={fm.lineRow} data-shape="party">
                  <Select round={12} className={fm.lineSelect} value={x.target} onChange={(e) => setSplit(x.key, { target: e.target.value })} aria-label={`Split ${i + 1} bills`}>
                    <option value={OWN}>HOUZS Venture (own)</option>
                    {data.companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                    {data.departments.map((dp) => (
                      <option key={dp.id} value={dp.id}>
                        {dp.label}
                      </option>
                    ))}
                    {offStill.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} (switched off)
                      </option>
                    ))}
                  </Select>
                  <input
                    className={fm.lineAmount}
                    inputMode="decimal"
                    value={x.pct}
                    onChange={(e) => setSplit(x.key, { pct: e.target.value })}
                    placeholder="0"
                    aria-label={`Split ${i + 1} %`}
                  />
                  <button type="button" className={fm.remove} onClick={() => setSplits((prev) => prev.filter((o) => o.key !== x.key))} aria-label={`Remove split ${i + 1}`}>
                    ×
                  </button>
                </div>
              </div>
            ))}
            <div className={fm.linesFoot}>
              <button type="button" className={fm.addLine} onClick={() => setSplits((prev) => [...prev, { key: nextKey(), target: OWN, pct: '' }])}>
                + Add split
              </button>
              <span className={fm.linesTotal} data-off={total > 100 ? 'true' : undefined}>
                {total}%
              </span>
            </div>
          </div>
        </Field>
        {error ? <Hint danger>{error}</Hint> : tried && problem ? <Hint>{problem}</Hint> : null}
      </DialogForm>
    </FinDialog>
  )
}

/** A saved month's snapshot: each company's heads and share, then the list as it stood (inactive faint). */
export function SnapshotDialog({
  open,
  onClose,
  period,
  rows,
  savedAt,
  labelOf,
}: {
  open: boolean
  onClose: () => void
  /** `YYYY-MM`. */
  period: string
  rows: SnapshotDetailRow[]
  savedAt: string | null
  labelOf: (targetId: string | null) => string
}) {
  const [q, setQ] = useState('')
  // Active rows make the totals — exactly what a calculation on this snapshot uses.
  const totals = new Map<string | null, number>()
  for (const r of rows) if (r.status === 'active' && r.pct > 0) totals.set(r.targetId, (totals.get(r.targetId) ?? 0) + r.pct / 100)
  const heads = [...totals.values()].reduce((s, v) => s + v, 0)
  const people = new Map<string, { status: string; department: string; splits: Array<{ targetId: string | null; pct: number }> }>()
  for (const r of rows) {
    if (!people.has(r.staffName)) people.set(r.staffName, { status: r.status, department: r.department, splits: [] })
    if (r.pct > 0) people.get(r.staffName)!.splits.push({ targetId: r.targetId, pct: r.pct })
  }
  const needle = q.trim().toLowerCase()
  const roster = [...people.entries()]
    .filter(([n, p]) => !needle || [n, p.department, ...p.splits.map((s) => labelOf(s.targetId))].join(' ').toLowerCase().includes(needle))
    .sort((x, y) => Number(x[1].status !== 'active') - Number(y[1].status !== 'active') || x[0].localeCompare(y[0]))
  return (
    <FinDialog open={open} onClose={onClose} title={`Snapshot · ${monthLong(period)}`} sub={savedAt ? `Saved ${officeTime(savedAt).format('DD MMM YYYY · HH:mm')}` : undefined}>
      <DialogForm
        buttons={
          <DialogButton kind="primary" onClick={onClose}>
            Close
          </DialogButton>
        }
      >
        <Field label={`By company · ${r2(heads)} heads`}>
          <div className={fm.summary} role="group" aria-label="By company">
            {[...totals.entries()]
              .sort((x, y) => y[1] - x[1])
              .map(([id, h]) => (
                <div key={id ?? 'own'} className={fm.summaryRow}>
                  <span className={fm.summaryLabel}>{labelOf(id)}</span>
                  <span className={fm.summaryValue}>
                    {h.toFixed(2)} · {heads > 0 ? ((h / heads) * 100).toFixed(1) : '0.0'}%
                  </span>
                </div>
              ))}
          </div>
        </Field>
        <Field label={`List · ${roster.length}${needle ? ` of ${people.size}` : ''} ${roster.length === 1 && !needle ? 'person' : 'people'}`} htmlFor="alloc-snap-q">
          <Input id="alloc-snap-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / department / company…" />
        </Field>
        <div className={fm.checks} role="list" aria-label="The list">
          {roster.length === 0 ? <div className={fm.check}>Nothing found.</div> : null}
          {roster.map(([n, p]) => (
            <div key={n} role="listitem" className={a.snapRow} data-off={p.status !== 'active' ? 'true' : undefined}>
              <span className={a.snapName}>{n}</span>
              <span className={a.snapMeta}>
                {[p.department, p.status !== 'active' ? 'inactive' : '', splitsText(p.splits.map((s) => ({ label: labelOf(s.targetId), pct: s.pct })))].filter(Boolean).join(' · ')}
              </span>
            </div>
          ))}
        </div>
      </DialogForm>
    </FinDialog>
  )
}

/** HR's allocation imported over the whole list — asked first, on the month picked. */
export function ImportDialog({
  open,
  onClose,
  onDone,
  hrPeriods,
}: {
  open: boolean
  onClose: () => void
  onDone: (message: string) => void
  /** HR's months, newest first (`YYYY-MM`). */
  hrPeriods: string[]
}) {
  const [month, setMonth] = useState(hrPeriods[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    if (!month || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await importAllocStaffFromHr(month)
      if (res.error) throw new Error(res.error)
      onDone(`Imported ${res.imported} ${res.imported === 1 ? 'person' : 'people'} from HR’s ${monthLong(month)} list`)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <FinDialog open={open} onClose={() => !busy && onClose()} title="Import HR’s list?" locked={busy}>
      <DialogConfirm
        text="This replaces the whole list with HR’s allocation for the month — from then on it is your own copy; HR’s later changes do not follow."
        confirmLabel={busy ? 'Importing…' : 'Import'}
        danger
        busy={busy}
        off={!month}
        error={error}
        onCancel={onClose}
        onConfirm={go}
      >
        <Field label="HR month" htmlFor="alloc-hr-month">
          <Select id="alloc-hr-month" round={12} className={fm.select} value={month} onChange={(e) => setMonth(e.target.value)}>
            {hrPeriods.map((p) => (
              <option key={p} value={p}>
                {monthLong(p)}
              </option>
            ))}
          </Select>
        </Field>
      </DialogConfirm>
    </FinDialog>
  )
}
