'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Facts, HistoryEvent, SecLabel, btn, hv, type ChipTone, Chip } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import { holdersLine, listNames, pctLabel, proposedHolders, stepLabel, type ShareAnswer, type ShareRequest } from '@/lib/member/share-requests'
import { decideShareRequest } from '../../../share-request-actions'
import s from './commission-workbench.module.css'
import r from './share-requests.module.css'

interface Props {
  requests: ShareRequest[]
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
export function hrStatus(q: Pick<ShareRequest, 'status' | 'parts'>): { text: string; tone: ChipTone } {
  switch (q.status) {
    case 'hr': return { text: 'To approve', tone: 'alert' }
    case 'partner': {
      const waiting = q.parts.filter(p => p.answer === 'pending').map(p => p.name)
      return { text: waiting.length ? `Waiting for ${listNames(waiting)}` : 'Waiting', tone: 'info' }
    }
    case 'approved': return { text: 'Approved', tone: 'ledger' }
    case 'rejected': return { text: 'Rejected', tone: 'danger' }
    case 'declined': {
      const who = q.parts.filter(p => p.answer === 'declined').map(p => p.name)
      return { text: who.length ? `Declined by ${listNames(who)}` : 'Declined', tone: 'plain' }
    }
    default: return { text: 'Withdrawn', tone: 'plain' }
  }
}

const ANSWER: Record<ShareAnswer, { text: string; tone: ChipTone }> = {
  pending: { text: 'Waiting', tone: 'info' },
  accepted: { text: 'Accepted', tone: 'ledger' },
  declined: { text: 'Declined', tone: 'danger' },
}

const when = (at: string) => officeTime(at).format('D MMM, HH:mm')
const monthName = (period: string) => officeTime(`${period}T00:00:00+08:00`).format('MMMM YYYY')

/**
 * Comm Cal › the month › Requests (2026-10-21 — the user: "在 Double claims 旁边加一个 Requests，点进去以后就弹出那个
 * request … HR 那边就会看到完整的 audit trail"): every share request on this month's bills. A salesperson sends one from
 * the Revenue app's bill, each colleague it names accepts it there, and only then is it HR's — Approve writes the shares
 * (the bill's sales value, KPI items and commission are split between its holders from then on, on every board), Reject
 * says why. A row opens its drawer: the bill, the split asked for, each colleague's answer, and the whole trail.
 */
export default function ShareRequestsPanel({ requests, unavailable, canDecide, basePath, returnTo, period }: Props) {
  const router = useRouter()
  const [decided, setDecided] = useState<Record<string, ShareRequest>>({})
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
  const billHref = (q: ShareRequest) =>
    `${basePath}/${q.bill?.periodMonth ?? q.periodMonth}/orders/${q.orderId}?from=${encodeURIComponent(returnTo)}`

  async function decide(approve: boolean) {
    if (!open || busy) return
    setBusy(approve ? 'approve' : 'reject')
    setError(null)
    try {
      const res = await decideShareRequest(open.id, approve, approve ? null : reason)
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

  const status = open ? hrStatus(open) : null
  const total = open?.bill?.total ?? 0

  return (
    <section aria-label="Share requests">
      <div className={s.topLine}>
        <h2 className={s.sectionHeading}>Share requests</h2>
      </div>
      {unavailable ? <p className={s.warning} role="alert">The share requests could not be read: {unavailable}</p> : null}
      {!unavailable && list.length === 0 ? (
        <div className={`${s.tableFrame} ${s.empty}`}>No salesperson asked to share a bill of {monthName(period)}.</div>
      ) : null}
      {list.length > 0 ? (
        <div className={s.tableFrame}>
          <div className={s.tableScroll}>
            <table className={s.table} aria-label={`Share requests, ${waiting} to approve`}>
              <thead>
                <tr>
                  <th>Bill</th><th>Salesperson</th><th>Shared with</th><th className={s.numeric}>Bill total</th><th>Sent</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map(q => {
                  const st = hrStatus(q)
                  return (
                    <tr key={q.id} className={r.row} onClick={() => openRow(q.id)} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(q.id) } }}>
                      <td><span className={r.billNo}>{q.orderNo}</span>{q.bill?.customer ? <small>{q.bill.customer}</small> : null}</td>
                      <td>{q.owner.name}</td>
                      <td>{q.parts.map(p => `${p.name} ${pctLabel(p.pct)}`).join(' · ')}</td>
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
        eyebrow="Share request"
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
                { l: 'Bill total', v: formatMoney(total) },
                { l: 'Salesperson', v: open.owner.name },
                { l: open.status === 'rejected' || open.status === 'declined' || open.status === 'cancelled' ? 'Split asked' : 'Split', v: holdersLine(proposedHolders(open)) },
                ...(open.status !== 'approved' && open.holders.length > 1 ? [{ l: 'Holders now', v: holdersLine(open.holders) }] : []),
                ...(open.note ? [{ l: 'Note', v: open.note }] : []),
                ...(open.decisionNote ? [{ l: open.status === 'rejected' ? 'Reason' : 'HR’s note', v: open.decisionNote }] : []),
              ]}
            />
            <SecLabel style={{ margin: '22px 0 10px' }}>Colleagues</SecLabel>
            <div className={r.parts}>
              {open.parts.map(p => (
                <div key={p.id} className={r.part}>
                  <span className={r.partName}>{p.name}</span>
                  <span className={r.partFigure}>{pctLabel(p.pct)} · {formatMoney(Math.round(total * p.pct * 100) / 100)}</span>
                  <Chip tone={ANSWER[p.answer].tone}>{ANSWER[p.answer].text}</Chip>
                </div>
              ))}
            </div>
            <SecLabel style={{ margin: '22px 0 10px' }}>Audit trail</SecLabel>
            <div>
              {open.events.map((e, i) => (
                <HistoryEvent key={i} what={stepLabel(e.step)} when={when(e.at)} who={e.name} note={e.note ?? undefined} />
              ))}
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
