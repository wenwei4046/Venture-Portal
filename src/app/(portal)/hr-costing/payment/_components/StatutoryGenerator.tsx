'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BODIES, shortDate, type BodyKey, type DeptGroup, type Granularity, type StatutoryCoverage, type StatutoryRow } from '@/lib/payment-cycle'
import { statutorySelection } from '@/lib/statutory-selection'
import { formatMoneyBare } from '@/lib/utils'
import { generateStatutorySelection } from '../actions'
import GenerationWindow from './GenerationWindow'

type Selection = ReturnType<typeof statutorySelection>
interface Review { group: DeptGroup; selection: Selection; date: string }

export default function StatutoryGenerator({ period, body, mode, groups, rows, coverage, fundedFor, onClose }: {
  period: string; body: BodyKey; mode: Granularity; groups: DeptGroup[]; rows: StatutoryRow[]
  coverage: StatutoryCoverage[]; fundedFor: (group: DeptGroup) => boolean; onClose: () => void
}) {
  const router = useRouter()
  const schemes = BODIES.find(item => item.key === body)!.schemes
  const [groupKey, setGroupKey] = useState(() => groups.find(group => statutorySelection(group.people, schemes, coverage, null, mode).count > 0)?.key ?? groups[0]?.key)
  const [selectedIds, setSelectedIds] = useState<Record<string, string[]>>({})
  const [date, setDate] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ count: number; people: number; total: number } | null>(null)
  const group = groups.find(item => item.key === groupKey)
  if (!group) return null
  const selection = statutorySelection(group.people, schemes, coverage, mode === 'department' ? null : selectedIds[group.key] ?? [], mode)
  const shown = review?.selection ?? selection
  const shownGroup = review?.group ?? group
  const locked = busy || review != null
  const eligibleIds = new Set(selection.eligible.map(person => person.row_id))
  const pickedIds = new Set(selection.rowIds)
  const funded = fundedFor(group)

  async function submit() {
    if (!review || inFlight.current) return
    const snapshot = review
    inFlight.current = true
    setBusy(true)
    setError(null)
    try {
      const created = await generateStatutorySelection(period, schemes, snapshot.group.scope, mode,
        snapshot.group.scope === 'staff' ? snapshot.group.dept_id : null, snapshot.selection.rowIds,
        snapshot.date || undefined, { total: snapshot.selection.total, voucherCount: snapshot.selection.voucherCount })
      setResult(created)
      setReview(null)
      setSelectedIds({})
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate vouchers')
      // Retain the reviewed snapshot. A new review is required after returning to selection.
      router.refresh()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const modeLabel = mode === 'department' ? 'Generate by Department' : 'Manual generate'
  return <GenerationWindow
    label={`${body} ${modeLabel}`} title={`${body} · ${modeLabel}`}
    description={mode === 'department' ? 'Include everyone in the department who still needs a PV.' : 'Choose the employees to include in this batch.'}
    step={result ? 'result' : review ? 'review' : 'selection'}
    closeDisabled={busy} onClose={() => { if (!inFlight.current) onClose() }}
    footer={!result ? <>
      <div className="pay-generation-footer"><div aria-live="polite"><span>{shown.count} people · {shown.voucherCount} PV{shown.voucherCount === 1 ? '' : 's'} · {shownGroup.name}</span><strong>RM {formatMoneyBare(shown.total)}</strong></div><div className="pay-row-actions">
        {review ? <><button type="button" className="pay-btn sec" disabled={busy} onClick={() => { setReview(null); setError(null) }}>Back to selection</button><button type="button" className="pay-btn pri" disabled={busy} onClick={() => { void submit() }}>{busy ? 'Generating…' : 'Confirm generation'}</button></> : <button type="button" className="pay-btn pri" disabled={busy || !funded || selection.count === 0} onClick={() => setReview({ group, selection, date })}>Review PVs →</button>}
      </div></div>
      {rows.filter(row => row.body === body).length > 1 ? <p className="pay-muted">SOCSO and EIS are separate PVs, both payable to PERKESO.</p> : null}
    </> : <button type="button" className="pay-btn sec" onClick={onClose}>Done</button>}
  >
    {error ? <p className="pay-err" role="alert">{error}</p> : null}
    {result ? <div role="status" className="pay-generation-result"><h3>{result.count} PV{result.count === 1 ? '' : 's'} generated</h3><p>{result.people} people · RM {formatMoneyBare(result.total)} · Awaiting Principal</p><button type="button" className="pay-btn sec" onClick={() => setResult(null)}>Continue with remaining employees</button></div> : <>
      {review ? <>
        <h3>Review {shown.voucherCount} PV{shown.voucherCount === 1 ? '' : 's'}</h3>
        <p className="pay-muted">{shownGroup.name} · Pay to {body} · Payment date {review.date ? shortDate(review.date) : 'to be set before approval'}</p>
        <div className="pay-table-wrap"><table className="pay-statement-table"><thead><tr><th>Employee</th><th>Scheme</th><th className="num">Amount · RM</th></tr></thead><tbody>{shown.lines.map(line => <tr key={`${line.person.row_id}:${line.scheme}`}><td>{line.person.name}</td><td>{line.scheme}</td><td className="num">{formatMoneyBare(line.amount)}</td></tr>)}</tbody></table></div>
      </> : <div className="pay-generation-grid">
        <nav className="pay-department-picker" aria-label="Choose statutory department">{groups.map(item => {
          const available = statutorySelection(item.people, schemes, coverage, null, mode).count
          return <button type="button" key={item.key} aria-pressed={item.key === group.key} onClick={() => { setGroupKey(item.key); setError(null) }} disabled={busy}>{item.name}<small>{available} remaining</small></button>
        })}</nav>
        <div className="pay-generation-people">
          <div className="pay-generation-fields"><div>Pay to<strong>{body}</strong></div><label>Payment date<input type="date" className="pay-date" value={date} onChange={e => setDate(e.target.value)} disabled={locked} /></label></div>
          <div className="pay-table-wrap"><table className="pay-statement-table"><thead><tr>
            {mode === 'employee' ? <th><input type="checkbox" aria-label="Select all remaining employees" checked={selection.count > 0 && selection.count === selection.eligible.length} disabled={locked || selection.eligible.length === 0} onChange={e => setSelectedIds(current => ({ ...current, [group.key]: e.target.checked ? selection.eligible.map(person => person.row_id) : [] }))} /></th> : null}
            <th>Employee</th>{schemes.map(scheme => <th className="num" key={scheme}>{scheme}</th>)}<th>Status</th>
          </tr></thead><tbody>{group.people.map(person => <tr key={person.row_id}>
            {mode === 'employee' ? <td><input type="checkbox" aria-label={`Select ${person.name}`} checked={pickedIds.has(person.row_id)} disabled={locked || !eligibleIds.has(person.row_id)} onChange={e => setSelectedIds(current => ({ ...current, [group.key]: e.target.checked ? [...selection.rowIds, person.row_id] : selection.rowIds.filter(id => id !== person.row_id) }))} /></td> : null}
            <td>{person.name}{person.code ? <small>{person.code}</small> : null}</td>{schemes.map(scheme => {
              const line = statutorySelection([person], [scheme], coverage, null, mode).lines[0]
              return <td className="num" key={scheme}>{line ? formatMoneyBare(line.amount) : '—'}</td>
            })}<td className="pay-muted">{eligibleIds.has(person.row_id) ? 'To generate' : coverage.some(line => line.scope === person.scope && line.row_id === person.row_id && schemes.includes(line.scheme)) ? 'Already covered' : 'No contribution'}</td>
          </tr>)}</tbody></table></div>
          {!funded ? <p className="pay-muted">{group.name} funding is not complete yet.</p> : null}
        </div>
      </div>}
    </>}
  </GenerationWindow>
}
