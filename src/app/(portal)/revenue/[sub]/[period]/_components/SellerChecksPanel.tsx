'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Chip, Facts, SecLabel, btn, hv, type ChipTone } from '@/components/hrv/kit'
import { Drawer } from '@/components/hrv/overlay'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import { answered, isWaiting, sharedPapers, sourceLabel, type SellerCheck, type SellerEvidenceOrder } from '@/lib/commission/seller-checks'
import { answerSellerCheck, answerSellerMove } from '../../../seller-check-actions'
import s from './commission-workbench.module.css'
import r from './seller-checks.module.css'

interface Props {
  checks: SellerCheck[]
  /** Why the questions could not be read, when they could not. */
  unavailable: string | null
  /** Revenue · Edit on this page: the two answers. */
  canDecide: boolean
  /** `/revenue/fair` — a bill's own page is `${base}/${month}/orders/${id}`. */
  basePath: string
  /** Where a bill opened from here leads back to — this tab, on this month. */
  returnTo: string
  /** The month, `YYYY-MM-01`. */
  period: string
}

/** A question's state as HR reads it: what waits on them first. */
export function checkStatus(
  c: Pick<SellerCheck, 'status' | 'counts'> & Partial<Pick<SellerCheck, 'kind' | 'move'>>,
): { text: string; tone: ChipTone } {
  if (c.kind === 'erp_moved' && c.move) {
    // The ERP's move is stopped: the bill stays with whom it was until HR answers.
    if (c.status === 'theirs') return { text: `${c.move.to.name}’s now`, tone: 'ledger' }
    if (c.status === 'not_theirs') return { text: `Kept ${c.move.from.name}’s`, tone: 'plain' }
    return { text: 'Stopped · to answer', tone: 'alert' }
  }
  if (c.status === 'theirs') return { text: 'Their own sale', tone: 'ledger' }
  if (c.status === 'not_theirs') return { text: 'Not theirs', tone: 'plain' }
  // Counted again by hand (Count again on the ledger) before anybody answered.
  return c.counts ? { text: 'Counting · to answer', tone: 'info' } : { text: 'Held · to answer', tone: 'alert' }
}

/** One question a bill and kind: a bill may be asked both whose paper it is and whose it stays. */
const keyOf = (c: Pick<SellerCheck, 'orderId' | 'kind'>) => `${c.orderId}:${c.kind}`

const when = (at: string) => officeTime(at).format('D MMM, HH:mm')
const day = (d: string) => officeTime(`${d}T00:00:00+08:00`).format('D MMM YYYY')
const monthName = (period: string) => officeTime(`${period}T00:00:00+08:00`).format('MMMM YYYY')
const shortMonth = (period: string) => officeTime(`${period}T00:00:00+08:00`).format('MMM YYYY')

/** When the other order was: a claim form's month, else the day it was sold. */
export function orderWhen(o: Pick<SellerEvidenceOrder, 'source' | 'month' | 'soldOn'>): string | null {
  if (o.source === 'claim_form' && o.month) return shortMonth(o.month)
  return o.soldOn ? day(o.soldOn) : null
}

/**
 * Comm Cal › the month › Whose sale (2026-10-31 — the user, on SHAWN keying the orders of salespeople who had left as
 * new orders of his own: "要能够分开哪些是真正他自己开的单，哪些是他只是帮人家处理的单"). Every bill of the month the feed held
 * because its paper number is already on another salesperson's order — a bill of the portal's, a claim form's row, an
 * order of the ERP's own. A row opens its drawer: what was found, whose it was, whether they left, whether the ERP's
 * Shared with names this salesperson (who then only looks after it) — and HR's answer. A Share order request, two
 * salespeople half each, is the Requests tab's and never this one's.
 */
export default function SellerChecksPanel({ checks, unavailable, canDecide, basePath, returnTo, period }: Props) {
  const router = useRouter()
  const [changed, setChanged] = useState<Record<string, SellerCheck>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'theirs' | 'not' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // An answer shows at once; once the page is read again with it (who answered, when), the page's own row wins.
  const list = checks.map(c => {
    const mine = changed[keyOf(c)]
    return mine && (mine.status !== c.status || mine.counts !== c.counts) ? mine : c
  })
  const open = openId ? list.find(c => keyOf(c) === openId) ?? null : null
  const waiting = list.filter(isWaiting).length

  const openRow = (id: string | null) => {
    setOpenId(id)
    setNote('')
    setError(null)
  }
  const billHref = (c: SellerCheck) =>
    `${basePath}/${c.periodMonth || period}/orders/${c.orderId}?from=${encodeURIComponent(returnTo)}`

  /** `theirs`: the salesperson the bill is on now keeps it — their own sale, or where the ERP moved it. */
  async function answer(theirs: boolean) {
    if (!open || busy) return
    setBusy(theirs ? 'theirs' : 'not')
    setError(null)
    try {
      const said = note.trim() || null
      const res = open.kind === 'erp_moved'
        ? await answerSellerMove(open.orderId, !theirs, said)
        : await answerSellerCheck(open.orderId, theirs, said)
      if (!res.ok) { setError(res.reason); return }
      setChanged(all => ({ ...all, [keyOf(open)]: { ...answered(open, res.answer), note: said } }))
      setNote('')
      router.refresh()
    } catch (err) {
      const text = err instanceof Error ? err.message : 'That did not save.'
      if (!text.includes('NEXT_REDIRECT')) setError(text)
    } finally {
      setBusy(null)
    }
  }

  const status = open ? checkStatus(open) : null
  const name = open?.staffName ?? ''
  // The two answers in the bill's own names: a paper question asks about the salesperson it is on; a move, about the
  // salesperson it was on and the one the ERP gave it to.
  const answers = open?.kind === 'erp_moved' && open.move
    ? { no: `Keep ${open.move.from.name}’s`, yes: `${open.move.to.name}’s now` }
    : { no: `Not ${name}’s sale`, yes: `${name}’s own sale` }

  return (
    <section aria-label="Whose sale">
      <div className={s.topLine}>
        <h2 className={s.sectionHeading}>Whose sale</h2>
      </div>
      {unavailable ? <p className={s.warning} role="alert">The questions could not be read: {unavailable}</p> : null}
      {!unavailable && list.length === 0 ? (
        <div className={`${s.tableFrame} ${s.empty}`}>No bill of {monthName(period)} waits on whose sale it is.</div>
      ) : null}
      {list.length > 0 ? (
        <div className={s.tableFrame}>
          <div className={s.tableScroll}>
            <table className={s.table} aria-label={`Whose sale, ${waiting} to answer`}>
              <thead>
                <tr>
                  <th>Bill</th><th>Salesperson</th><th>Paper</th><th>Found on</th><th className={s.numeric}>Bill total</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map(c => {
                  const st = checkStatus(c)
                  const first = c.orders[0]
                  const at = first ? orderWhen(first) : null
                  return (
                    <tr key={keyOf(c)} className={r.row} onClick={() => openRow(keyOf(c))} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(keyOf(c)) } }}>
                      <td><span className={r.billNo}>{c.orderNo}</span>{c.customer ? <small>{c.customer}</small> : null}</td>
                      <td>{c.staffName}</td>
                      <td>{sharedPapers(c).join(' · ') || c.refNo || '—'}</td>
                      <td>
                        {c.move ? (
                          <>
                            {c.move.from.name} → {c.move.to.name}
                            <small>{['Moved in the ERP', c.move.movedAt ? when(c.move.movedAt) : null].filter(Boolean).join(' · ')}</small>
                          </>
                        ) : first ? <>{first.seller} · {first.docNo}</> : (c.sellerName ?? '—')}
                        {!c.move && first ? (
                          <small>
                            {[sourceLabel(first.source), at, first.sellerLeft ? 'left' : null,
                              c.orders.length > 1 ? `+${c.orders.length - 1} more` : null].filter(Boolean).join(' · ')}
                          </small>
                        ) : null}
                      </td>
                      <td className={s.numeric}>{formatMoney(c.total)}</td>
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
        width={480}
        eyebrow="Whose sale"
        title={open ? <Link href={billHref(open)}>{open.orderNo}</Link> : null}
        sub={open ? [open.customer || 'Walk-in', open.orderDate ? day(open.orderDate) : null].filter(Boolean).join(' · ') : null}
        footer={
          open ? (
            canDecide ? (
              <>
                <button type="button" className={btn('outline')} onClick={() => openRow(null)} disabled={!!busy}>Close</button>
                {open.status !== 'not_theirs' ? (
                  <button type="button" className={btn('danger')} onClick={() => void answer(false)} disabled={!!busy}>
                    {busy === 'not' ? 'Saving…' : answers.no}
                  </button>
                ) : null}
                {open.status !== 'theirs' ? (
                  <button type="button" className={btn('primary')} onClick={() => void answer(true)} disabled={!!busy}>
                    {busy === 'theirs' ? 'Saving…' : answers.yes}
                  </button>
                ) : null}
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
                { l: 'Bill total', v: formatMoney(open.total) },
                { l: 'Salesperson', v: open.staffName },
                { l: 'Ref No.', v: open.refNo || '—' },
                // When it was asked — a bill asked without being held (or counted again by hand) is no "Held".
                ...(open.askedAt ? [{ l: 'Asked', v: when(open.askedAt) }] : []),
                ...(open.decidedByName && open.decidedAt ? [{ l: 'Answered', v: `${open.decidedByName} · ${when(open.decidedAt)}` }] : []),
                ...(open.note ? [{ l: 'HR’s note', v: open.note }] : []),
              ]}
            />
            {open.move ? (
              <>
                <SecLabel style={{ margin: '22px 0 10px' }}>Moved in the ERP</SecLabel>
                <div className={r.found}>
                  <div className={r.order}>
                    <div className={r.orderLine}>
                      <strong>{open.move.from.name}</strong> → <strong>{open.move.to.name}</strong>
                      {open.move.movedAt ? ` · ${when(open.move.movedAt)}` : ''}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            {open.orders.length > 0 ? <SecLabel style={{ margin: '22px 0 10px' }}>Found on</SecLabel> : null}
            <div className={r.found} hidden={open.orders.length === 0}>
              {open.orders.map(o => {
                const at = orderWhen(o)
                return (
                  <div key={`${o.source}:${o.docNo}`} className={r.order}>
                    <div className={r.orderHead}>
                      <span className={r.docNo}>{o.docNo}</span>
                      <Chip tone="plain" soft>{sourceLabel(o.source)}</Chip>
                    </div>
                    <div className={r.orderLine}>
                      <strong>{o.seller}</strong>{at ? ` · ${at}` : ''} · {formatMoney(o.total)} · {o.papers.join(' · ')}
                    </div>
                    {o.sellerLeft || o.handledBySeller || o.cancelled ? (
                      <div className={r.chips}>
                        {o.sellerLeft ? <Chip tone="danger" soft>{o.seller} left</Chip> : null}
                        {o.handledBySeller ? <Chip tone="info" soft>ERP Shared with · {open.staffName}</Chip> : null}
                        {o.cancelled ? <Chip tone="plain" soft>Cancelled</Chip> : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {open.booth ? (
              <>
                <SecLabel style={{ margin: '22px 0 10px' }}>Booth</SecLabel>
                <Facts rows={[{ l: open.booth.fair, v: open.booth.staff.join(', ') }]} />
              </>
            ) : null}
            {canDecide ? (
              <label className={r.note}>
                <span className={hv.secLabel}>Note</span>
                <textarea rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
              </label>
            ) : null}
            {error ? <p className={r.error} role="alert">{error}</p> : null}
          </>
        ) : null}
      </Drawer>
    </section>
  )
}
