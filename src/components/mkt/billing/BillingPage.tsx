'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { confirmMktBills, withdrawMktBill } from '@/lib/marketing/actions'
import {
  billingTotals, billMissing, billPartyLines, clientLines, confirmable, invoiceWords, lineWhen, monthKey, monthLabel, shiftMonth,
  type BillingPage as Page, type BillLine,
} from '@/lib/marketing/billing'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import s from './billing.module.css'

// Billing (②b-2b — the user's answers 43–48, 50, 51), the manager's: the month's lines by client — a one-time project
// the month it was done, a recurring one every month from its first run until stopped — each with the project's amount
// now; *Confirm* keeps it as it is for Finance's import, *Withdraw* takes it back — until Finance imports it: then the
// line says the invoice it is on, and comes back to withdraw once Finance deletes that draft or voids it (②b-2h). ‹ ›
// walk the months (never past this one); the months still to confirm are named at the top.

const monthHref = (m: string, now: string) => (m === now ? '/marketing/billing' : `/marketing/billing?m=${monthKey(m)}`)

export default function BillingPage({ initial }: { initial: Page }) {
  const [page, setPage] = useState(initial)
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])
  const say = (t: string) => {
    setToast(t)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  const groups = clientLines(page)
  const totals = billingTotals(page)
  const prev = shiftMonth(page.month, -1)
  const next = shiftMonth(page.month, 1)
  const label = monthLabel(page.month)

  const confirm = (key: string, projects: string[], what: string) =>
    start(async () => {
      setBusy(key)
      const r = await confirmMktBills(page.month, projects)
      setBusy(null)
      if (!r.ok) return say(r.reason)
      if (r.page) setPage(r.page)
      say(r.confirmed ? `Confirmed · ${what}` : 'Confirmed already')
    })
  const withdraw = (l: BillLine) =>
    start(async () => {
      if (!l.bill) return
      setBusy(l.project)
      const r = await withdrawMktBill(l.bill.id)
      setBusy(null)
      if (!r.ok) return say(r.reason)
      if (r.page) setPage(r.page)
      say(`Withdrawn · ${l.track}`)
    })

  return (
    <div className={s.page}>
      <div className={s.head}>
        <span className={s.headIcon} aria-hidden="true">💰</span>
        <span className={s.title}>Billing</span>
        <span className={s.grow} />
        <div className={s.months}>
          <Link className={s.navBtn} href={monthHref(prev, page.now)} aria-label={`Back to ${monthLabel(prev)}`}>‹</Link>
          <span className={s.month}>{label}</span>
          {page.month < page.now ? (
            <Link className={s.navBtn} href={monthHref(next, page.now)} aria-label={`On to ${monthLabel(next)}`}>›</Link>
          ) : (
            <span className={`${s.navBtn} ${s.navOff}`} aria-hidden="true">›</span>
          )}
          {page.month !== page.now ? <Link className={s.todayBtn} href="/marketing/billing">This month</Link> : null}
        </div>
      </div>

      {page.open.length ? (
        <div className={s.open} aria-label="Months still to confirm">
          <span className={s.openLabel}>Still to confirm</span>
          {page.open.map(o => (
            <Link key={o.month} className={s.openChip} href={monthHref(o.month, page.now)}>
              {monthLabel(o.month)} <span className={s.openN}>{o.due}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}><span className={`${s.statDot} ${s.dotWait}`} aria-hidden="true" />To confirm</span>
          <span className={`${s.statN} ${s.mono}`}>{formatMoney(totals.due)}</span>
          <span className={s.statSub}>{totals.dueLines} line{totals.dueLines === 1 ? '' : 's'}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}><span className={`${s.statDot} ${s.dotDone}`} aria-hidden="true" />Confirmed</span>
          <span className={`${s.statN} ${s.mono}`}>{formatMoney(totals.confirmed)}</span>
          <span className={s.statSub}>{totals.confirmedLines} line{totals.confirmedLines === 1 ? '' : 's'}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}><span className={`${s.statDot} ${s.dotInk}`} aria-hidden="true" />Clients</span>
          <span className={s.statN}>{totals.clients}</span>
          <span className={s.statSub}>{label}</span>
        </div>
      </div>

      {groups.length ? (
        <div className={s.clients}>
          {groups.map(g => {
            const ids = confirmable(g.lines)
            const party = billPartyLines(g.sub.bill)
            return (
              <section key={g.sub.id} className={s.client} aria-label={g.sub.name}>
                <div className={s.clientHead}>
                  <span className={s.clientDot} style={{ background: g.sub.dot }} aria-hidden="true" />
                  <span className={s.clientEmoji} aria-hidden="true">{g.sub.emoji}</span>
                  <Link className={s.clientName} href={`/marketing/subsidiaries/${encodeURIComponent(g.sub.code)}`}>{g.sub.name}</Link>
                  <span className={s.kind}>{g.sub.client ? 'Client' : 'Group company'}</span>
                  <span className={s.grow} />
                  {g.dueLines ? <span className={s.clientDue}>To confirm <span className={s.mono}>{formatMoney(g.due)}</span></span> : null}
                  {ids.length > 1 ? (
                    <button type="button" className={s.primary} disabled={pending} onClick={() => confirm(g.sub.id, ids, `${g.sub.name} · ${ids.length} lines`)}>
                      {busy === g.sub.id ? 'Confirming…' : `Confirm all ${ids.length}`}
                    </button>
                  ) : null}
                </div>
                <div className={s.billTo}>
                  {g.sub.client ? (
                    billMissing(g.sub) ? (
                      <span className={s.warn}>
                        No billing {g.sub.bill?.name ? 'address' : 'name'} yet ·{' '}
                        <Link className={s.link} href={`/marketing/subsidiaries/${encodeURIComponent(g.sub.code)}?edit=1`}>Add it on its page</Link>
                      </span>
                    ) : (
                      <span><span className={s.billLabel}>Bill to</span> {party.join(' · ')}</span>
                    )
                  ) : (
                    <span><span className={s.billLabel}>Bill to</span> {g.sub.company ?? g.sub.name} · as Finance keeps it</span>
                  )}
                </div>
                <div className={s.lines}>
                  {g.lines.map(l => (
                    <div key={l.project} className={`${s.line}${l.bill ? ` ${s.lineDone}` : ''}`}>
                      <div className={s.lineMain}>
                        <Link className={s.track} href={`/marketing/projects/${l.project}`}>{l.track}</Link>
                        <span className={s.lineTitle}>{l.product || l.title}</span>
                        <span className={s.lineWhen}>{lineWhen(l)}</span>
                      </div>
                      <div className={s.lineEnd}>
                        {l.bill ? (
                          <>
                            <span className={`${s.amount} ${s.mono}`}>{formatMoney(l.bill.amount)}</span>
                            <span className={`${s.pill} ${s.pillDone}`}>
                              <span className={`${s.statDot} ${s.dotDone}`} aria-hidden="true" />
                              Confirmed{l.bill.by ? ` · ${l.bill.by}` : ''}{l.bill.at ? ` · ${officeTime(l.bill.at).format('D MMM')}` : ''}
                            </span>
                            {l.bill.invoice ? (
                              <span className={`${s.pill} ${s.pillInv}`}>{invoiceWords(l.bill.invoice)}</span>
                            ) : (
                              <button type="button" className={s.ghost} disabled={pending} onClick={() => withdraw(l)}>
                                {busy === l.project ? 'Withdrawing…' : 'Withdraw'}
                              </button>
                            )}
                          </>
                        ) : l.amount == null ? (
                          <>
                            <span className={s.noAmount}>No amount</span>
                            <Link className={s.ghost} href={`/marketing/projects/${l.project}`}>Set it →</Link>
                          </>
                        ) : (
                          <>
                            <span className={`${s.amount} ${s.mono}`}>{formatMoney(l.amount)}</span>
                            <button type="button" className={s.outline} disabled={pending} onClick={() => confirm(l.project, [l.project], l.track)}>
                              {busy === l.project ? 'Confirming…' : 'Confirm'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className={s.empty}>Nothing billed in {label}</div>
      )}
      {toast ? <div className={s.toast} role="status">{toast}</div> : null}
    </div>
  )
}
