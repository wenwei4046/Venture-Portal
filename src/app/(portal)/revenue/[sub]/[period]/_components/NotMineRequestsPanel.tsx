'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Facts, HistoryEvent, SecLabel, btn, hv, type ChipTone, Chip } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import type { NotMineRequest } from '@/lib/member/not-mine-requests'
import { decideNotMineRequest } from '../../../not-mine-request-actions'
import s from './commission-workbench.module.css'
import r from './share-requests.module.css'

interface Props {
  requests: NotMineRequest[]
  /** Why the requests could not be read, when they could not. */
  unavailable: string | null
  /** Revenue · Edit on this page: Approve and Reject. */
  canDecide: boolean
  /** `/revenue/fair` — a bill's own page is `${base}/${month}/orders/${id}`. */
  basePath: string
  /** Where a bill opened from here leads back to — this tab, on this month. */
  returnTo: string
  /** The month, `YYYY-MM-01`. */
  period: string
}

/** A request's state as HR reads it: what waits on them first. */
export function notMineHrStatus(q: Pick<NotMineRequest, 'status'>): { text: string; tone: ChipTone } {
  switch (q.status) {
    case 'hr': return { text: 'To approve', tone: 'alert' }
    case 'approved': return { text: 'Not counted', tone: 'ledger' }
    case 'rejected': return { text: 'Rejected', tone: 'danger' }
    default: return { text: 'Withdrawn', tone: 'plain' }
  }
}

const when = (at: string) => officeTime(at).format('D MMM, HH:mm')
const monthName = (period: string) => officeTime(`${period}T00:00:00+08:00`).format('MMMM YYYY')

/**
 * Comm Cal › the month › Requests — Not my order (2026-11-14 — the user, after IT-0010: a salesperson who keys or scans a
 * bill for somebody else writes a request "not my order" from the Revenue app, "and then HR approve。这样它就会直接变成是
 * 完完全全 don't count 的形式"). Every such request on this month's bills: Approve takes the bill out exactly as *Don't count
 * this bill* does, in HR's name (*Count this bill again* on its row undoes it); Reject says why, and the bill keeps
 * counting. A row opens its drawer: the bill, who asked and why, and what happened since.
 */
export default function NotMineRequestsPanel({ requests, unavailable, canDecide, basePath, returnTo, period }: Props) {
  const router = useRouter()
  const [decided, setDecided] = useState<Record<string, NotMineRequest>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const list = requests.map(q => decided[q.id] ?? q)
  const open = openId ? list.find(q => q.id === openId) ?? null : null
  const waiting = list.filter(q => q.status === 'hr').length

  const openRow = (id: string | null) => {
    setOpenId(id)
    setRejecting(false)
    setReason('')
    setError(null)
  }
  const billHref = (q: NotMineRequest) =>
    `${basePath}/${q.bill?.periodMonth ?? q.periodMonth}/orders/${q.orderId}?from=${encodeURIComponent(returnTo)}`

  async function decide(approve: boolean) {
    if (!open || busy) return
    setBusy(approve ? 'approve' : 'reject')
    setError(null)
    try {
      const res = await decideNotMineRequest(open.id, approve, approve ? null : reason)
      if (!res.ok) { setError(res.reason); return }
      setDecided(all => ({ ...all, [res.request.id]: res.request }))
      setRejecting(false)
      setReason('')
      router.refresh()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'That did not save.'
      if (!text.includes('NEXT_REDIRECT')) setError(text)
    } finally {
      setBusy(null)
    }
  }

  const status = open ? notMineHrStatus(open) : null

  return (
    <section aria-label="Not my order requests">
      <div className={s.topLine}>
        <h2 className={s.sectionHeading}>Not my order</h2>
      </div>
      {unavailable ? <p className={s.warning} role="alert">The Not my order requests could not be read: {unavailable}</p> : null}
      {!unavailable && list.length === 0 ? (
        <div className={`${s.tableFrame} ${s.empty}`}>No salesperson said a bill of {monthName(period)} is not theirs.</div>
      ) : null}
      {list.length > 0 ? (
        <div className={s.tableFrame}>
          <div className={s.tableScroll}>
            <table className={s.table} aria-label={`Not my order requests, ${waiting} to approve`}>
              <thead>
                <tr>
                  <th>Bill</th><th>Salesperson</th><th>Reason</th><th className={s.numeric}>Bill total</th><th>Sent</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map(q => {
                  const st = notMineHrStatus(q)
                  return (
                    <tr key={q.id} className={r.row} onClick={() => openRow(q.id)} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(q.id) } }}>
                      <td><span className={r.billNo}>{q.orderNo}</span>{q.bill?.customer ? <small>{q.bill.customer}</small> : null}</td>
                      <td>{q.staff.name}</td>
                      <td>{q.reason}</td>
                      <td className={s.numeric}>{formatMoney(q.bill?.total ?? 0)}</td>
                      <td>{when(q.createdAt)}</td>
                      <td><Chip tone={st.tone}>{st.text}</Chip></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Drawer
        open={open !== null}
        onClose={() => openRow(null)}
        width={460}
        eyebrow="Not my order"
        title={open ? <Link href={billHref(open)}>{open.orderNo}</Link> : null}
        sub={open ? [open.bill?.customer || 'Walk-in', open.bill?.venue || null, open.bill?.date ? officeTime(`${open.bill.date}T00:00:00+08:00`).format('D MMM YYYY') : null].filter(Boolean).join(' · ') : null}
        footer={
          open ? (
            rejecting ? (
              <>
                <button type="button" className={btn('outline')} onClick={() => { setRejecting(false); setError(null) }} disabled={!!busy}>Back</button>
                <button type="button" className={btn('dangerSolid')} onClick={() => void decide(false)} disabled={!!busy || !reason.trim()}>
                  {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
              </>
            ) : open.status === 'hr' && canDecide ? (
              <>
                <button type="button" className={btn('danger')} onClick={() => { setRejecting(true); setError(null) }} disabled={!!busy}>Reject</button>
                <button type="button" className={btn('outline')} onClick={() => openRow(null)} disabled={!!busy}>Close</button>
                <button type="button" className={btn('primary')} onClick={() => void decide(true)} disabled={!!busy}>
                  {busy === 'approve' ? 'Approving…' : 'Approve'}
                </button>
              </>
            ) : (
              <button type="button" className={btn('outline')} onClick={() => openRow(null)}>Close</button>
            )
          ) : null
        }
      >
        {open && status ? (
          <>
            <div className={r.status}><Chip tone={status.tone}>{status.text}</Chip></div>
            <Facts
              rows={[
                { l: 'Bill total', v: formatMoney(open.bill?.total ?? 0) },
                { l: 'Salesperson', v: open.staff.name },
                { l: 'Reason', v: open.reason },
                ...(open.status === 'hr' && open.bill && !open.bill.counts ? [{ l: 'The bill', v: 'Does not count already' }] : []),
                ...(open.decisionNote ? [{ l: open.status === 'rejected' ? 'Why rejected' : 'HR’s note', v: open.decisionNote }] : []),
              ]}
            />
            <SecLabel style={{ margin: '22px 0 10px' }}>Audit trail</SecLabel>
            <div>
              <HistoryEvent what="Sent" when={when(open.createdAt)} who={open.staff.name} />
              {open.status === 'cancelled' ? <HistoryEvent what="Withdrawn" when={when(open.updatedAt)} who={open.staff.name} /> : null}
              {open.status === 'approved' || open.status === 'rejected' ? (
                <HistoryEvent what={open.status === 'approved' ? 'Approved · not counted' : 'Rejected'}
                  when={when(open.decidedAt ?? open.updatedAt)} who={open.decidedByName ?? 'HR'} note={open.decisionNote ?? undefined} />
              ) : null}
            </div>
            {rejecting ? (
              <label className={r.reason}>
                <span className={hv.secLabel}>Why it is rejected</span>
                <textarea rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} autoFocus />
              </label>
            ) : null}
            {error ? <p className={r.error} role="alert">{error}</p> : null}
          </>
        ) : null}
      </Drawer>
    </section>
  )
}
