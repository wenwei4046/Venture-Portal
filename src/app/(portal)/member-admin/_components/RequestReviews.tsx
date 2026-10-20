'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Chip, Facts, HistoryEvent, SecLabel, hv } from '@/components/hrv/kit'
import { flash } from '@/components/hrv/toast'
import { adminMemberAction, type AdminMemberData, type AdminMemberInput } from '@/app/(member)/member/actions'
import type { MemberRequest } from '@/lib/member/types'
import { claimPayoutLine, readClaimPayout } from '@/lib/member/claim-payout'
import { revenuePath, subDeptSlug } from '@/lib/revenue'
import { shortDay } from '@/lib/commission/sales-group-requests'
import { officeToday } from '@/lib/office-time'
import {
  ACCEPT_NOTE,
  REQUEST_FILTERS,
  approveLabel,
  approvedText,
  arrangementOf,
  choosesReplacement,
  defaultEffective,
  defaultSeat,
  effectiveWhen,
  filterRequests,
  hasSignedForm,
  isOpen,
  requestCaption,
  requestFacts,
  requestHistory,
  requestMeta,
  requestStatus,
  requestStep,
  requestTitle,
  runFailure,
  scheduledNotice,
  seatOptions,
  type RequestFacts,
  type RequestFilter,
} from '@/lib/member/member-services'
import { scheduleReplacement, unscheduleReplacement } from '../replacement-actions'
import s from './member-services.module.css'

type Act = { label: string; primary?: boolean; needsNote?: boolean; input: AdminMemberInput; done: string }
type Outcome = { ok: true; done: string } | { ok: false; reason: string }

/**
 * Member services › Request reviews (2026-10-10, the HR revamp): every request
 * on the left (All · Claim · Replacement · Waiting list), the open one on the
 * right — its facts, the step HR takes, the note, the buttons, and its audit
 * history. A waiting-list applicant is accepted here and then transferred or
 * failed on Sales Groups; a claim is decided here, once, into payroll or as a
 * payment request; a replacement is approved with who takes the seat and the
 * date, and the system makes the change on that date (HR revamp 4b).
 */
export default function RequestReviews({
  data,
  facts,
  initialRequestId,
}: {
  data: AdminMemberData
  facts: Record<string, RequestFacts> | null
  initialRequestId: string | null
}) {
  const [filter, setFilter] = useState<RequestFilter>('all')
  const [picked, setPicked] = useState<string | null>(initialRequestId)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // A replacement's choice, kept per request while HR looks at others.
  const [seats, setSeats] = useState<Record<string, string>>({})
  const [dates, setDates] = useState<Record<string, string>>({})

  const shown = filterRequests(data.requests, filter)
  const selected = data.requests.find(r => r.id === picked) ?? shown[0] ?? null

  function open(id: string) {
    setPicked(id)
    setNote('')
    setError('')
  }

  async function perform(work: () => Promise<Outcome | null>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await work()
      if (!result) return
      if (!result.ok) {
        setError(result.reason)
        return
      }
      setNote('')
      flash(result.done)
    } catch {
      setError('The action could not be completed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function run(act: Act) {
    if (busy) return
    if (act.needsNote && !note.trim()) {
      setError('Write a review note first — it goes on the record.')
      return
    }
    void perform(async () => {
      const result = await adminMemberAction(act.input)
      if (!result.ok) return { ok: false, reason: result.error }
      if (act.input.action === 'invoice' || act.input.action === 'signed_form') {
        const link = result.data as { url?: string; download?: string } | null
        if (link?.url) window.open(link.url, '_blank', 'noopener,noreferrer')
        // A Word form is saved, not shown (2026-10-20): said as the viewer's Download says it.
        if (link?.url && link.download) flash(`Downloads ${link.download}`)
        return null
      }
      return { ok: true, done: act.done }
    })
  }

  function approve(r: MemberRequest, seat: string, successor: string | null, date: string, sub: string | null) {
    void perform(async () => {
      const result = await scheduleReplacement({ requestId: r.id, successorId: seat || null, effective: date, note })
      if (!result.ok) return result
      return { ok: true, done: approvedText(r, facts?.[r.id], successor, sub, date, result.ran) }
    })
  }

  function unschedule(r: MemberRequest) {
    void perform(async () => {
      const result = await unscheduleReplacement(r.id)
      if (!result.ok) return result
      return { ok: true, done: 'Taken off the schedule — back to Pending review' }
    })
  }

  return (
    <div className={s.reqGrid}>
      <section className={s.card} aria-labelledby="requests-title">
        <div className={s.listHead}>
          <h2 id="requests-title" className={s.listTitle}>Requests</h2>
        </div>
        <div className={s.filters} role="group" aria-label="Show">
          {REQUEST_FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={hv.darkPill} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className={s.rows}>
          {shown.map(r => {
            const st = requestStatus(r.status)
            return (
              <button key={r.id} type="button" className={s.row} aria-pressed={selected?.id === r.id} onClick={() => open(r.id)}>
                <span className={s.rowText}>
                  <span className={s.rowTitle} style={{ display: 'block' }}>{requestTitle(r, facts?.[r.id])}</span>
                  <span className={s.rowMeta} style={{ display: 'block' }}>{requestMeta(r)}</span>
                </span>
                <Chip tone={st.tone} style={{ fontSize: 10.5, flex: 'none' }}>{st.name}</Chip>
              </button>
            )
          })}
          {shown.length === 0 ? <p className={s.empty}>{data.requests.length ? 'No requests of this type.' : 'No requests yet.'}</p> : null}
        </div>
      </section>

      <section className={s.detail} aria-label="Request">
        {selected ? (
          <Detail
            r={selected}
            data={data}
            facts={facts?.[selected.id]}
            note={note}
            setNote={v => {
              setNote(v)
              setError('')
            }}
            error={error}
            busy={busy}
            seat={seats[selected.id]}
            setSeat={v => setSeats(m => ({ ...m, [selected.id]: v }))}
            date={dates[selected.id]}
            setDate={v => setDates(m => ({ ...m, [selected.id]: v }))}
            run={run}
            approve={approve}
            unschedule={unschedule}
          />
        ) : (
          <p className={s.empty} style={{ margin: 0 }}>Nothing to review yet.</p>
        )}
      </section>
    </div>
  )
}

function Detail({
  r,
  data,
  facts,
  note,
  setNote,
  error,
  busy,
  seat: seatChosen,
  setSeat,
  date: dateChosen,
  setDate,
  run,
  approve,
  unschedule,
}: {
  r: MemberRequest
  data: AdminMemberData
  facts: RequestFacts | undefined
  note: string
  setNote: (v: string) => void
  error: string
  busy: boolean
  seat: string | undefined
  setSeat: (v: string) => void
  date: string | undefined
  setDate: (v: string) => void
  run: (act: Act) => void
  approve: (r: MemberRequest, seat: string, successor: string | null, date: string, sub: string | null) => void
  unschedule: (r: MemberRequest) => void
}) {
  const st = requestStatus(r.status)
  const sub = data.departments.find(d => d.id === String(r.detail.subDepartmentId ?? ''))?.name ?? null
  const name = String(r.detail.newPerson ?? '').trim() || 'The applicant'
  const open = isOpen(r)
  const choosing = choosesReplacement(r)
  const can = data.canManageRequests
  const base = { requestId: r.id }
  const moreInfo: Act = { label: 'Request more information', needsNote: true, input: { action: 'needs_info', ...base, note }, done: 'Sent back for more information' }
  const reject: Act = { label: 'Reject', needsNote: true, input: { action: 'reject', ...base, note }, done: 'Request rejected' }

  const today = officeToday()
  const options = choosing ? seatOptions(r, data) : []
  const seat = seatChosen ?? defaultSeat(r, options)
  const date = dateChosen ?? defaultEffective(r, today)
  const successor = options.find(o => o.id !== '' && o.id === seat)?.label ?? null

  let acts: Act[] = []
  let notice: ReactNode = null
  if (open && r.kind === 'waiting') {
    acts = [moreInfo, reject, {
      label: 'Accept',
      primary: true,
      input: { action: 'qualify', ...base, note: note.trim() || ACCEPT_NOTE },
      done: `${name} accepted onto ${sub ?? 'the'}${sub ? '’s' : ''} waiting list`,
    }]
  } else if (open && r.kind === 'claim') {
    acts = [moreInfo, reject,
      { label: 'Approve · request payment', input: { action: 'approve', route: 'payment', ...base, note }, done: 'Claim approved — a payment request goes to Finance' },
      { label: 'Approve · add to payroll', primary: true, input: { action: 'approve', route: 'payroll', ...base, note }, done: 'Claim approved — added to payroll' },
    ]
  } else if (open && r.kind === 'replacement') {
    acts = [moreInfo, reject]
  }

  if (r.kind === 'waiting' && ['waiting', 'reserved', 'accepted'].includes(r.status)) {
    notice = (
      <>
        On {sub ?? 'the sub-department'}&apos;s waiting list. Transfer to employee from Sales Groups › Waiting list.
        {sub ? <Link href={`${revenuePath(subDeptSlug(sub), 'hierarchy')}?tab=waiting`}>Open the waiting list →</Link> : null}
      </>
    )
  } else if (r.kind === 'waiting' && (r.status === 'executed' || r.status === 'allocated')) {
    notice = `${name} has been transferred to an employee.`
  } else if (r.kind === 'waiting' && r.status === 'failed') {
    notice = `Taken off the waiting list${r.note ? ` — ${r.note}` : ''}.`
  } else if (r.kind === 'replacement' && r.status === 'scheduled') {
    notice = (
      <>
        {scheduledNotice(r, facts, sub)}
        {can ? (
          <button type="button" className={s.linkish} disabled={busy} onClick={() => unschedule(r)}>Take off the schedule →</button>
        ) : null}
      </>
    )
  } else if (r.kind === 'replacement' && r.status === 'executed') {
    notice = arrangementOf(r) === 'resignation' ? (
      <>
        Replaced automatically. See People Management for the deactivated record.
        <Link href="/team/people">Open People Management →</Link>
      </>
    ) : (
      <>
        Replaced automatically. See Sales Groups for the new chart.
        {sub ? <Link href={revenuePath(subDeptSlug(sub), 'hierarchy')}>Open Sales Groups →</Link> : null}
      </>
    )
  } else if (r.kind === 'claim') {
    const where = claimPayoutLine(readClaimPayout(r.payout), r.status, 'hr')
    if (where) notice = where
  }

  const caption = requestCaption(r, sub, facts)
  const history = requestHistory(facts, r.kind, r.detail)
  const signature = typeof r.detail.signatureImage === 'string' && /^data:image\/png;base64,/.test(r.detail.signatureImage) ? r.detail.signatureImage : null
  const failure = r.kind === 'replacement' && r.status === 'scheduled' ? runFailure(r.note) : null

  return (
    <>
      <div className={s.detailHead}>
        <div>
          <h2 className={s.detailTitle}>{requestTitle(r, facts)}</h2>
          <div className={s.detailRef}>Reference {r.requestNo ?? r.id}</div>
        </div>
        <Chip tone={st.tone} style={{ padding: '3px 10px' }}>{st.name}</Chip>
      </div>
      <Facts
        rows={[
          // The signed application form a waiting list was sent with opens from its row (2026-10-10).
          ...requestFacts(r, facts, data).map(f => f.l === 'Signed form' && hasSignedForm(r)
            ? { l: f.l, v: <>{f.v} <button type="button" className={s.linkish} disabled={busy} onClick={() => run({ label: 'View signed form', input: { action: 'signed_form', requestId: r.id }, done: '' })}>View ↗</button></> }
            : f),
          // Only a claim sent with an invoice has one to open — a food claim and Outstation by road have none.
          ...(r.kind === 'claim' && r.claimId && typeof r.detail.invoiceHash === 'string' && r.detail.invoiceHash
            ? [{ l: 'Invoice', v: <button type="button" className={s.linkish} style={{ marginLeft: 0 }} disabled={busy} onClick={() => run({ label: 'View invoice', input: { action: 'invoice', requestId: r.id }, done: '' })}>View invoice ↗</button> }]
            : []),
        ]}
        labelWidth={200}
        gap="8px 16px"
        style={{ margin: '18px 0 20px', fontSize: 13 }}
      />
      {signature ? <img src={signature} alt={`${name}'s signature`} className={s.signature} /> : null}

      <div className={s.step}>
        <div className={s.stepTitle}>{requestStep(r)}</div>
        {caption ? <p className={s.caption}>{caption}</p> : null}

        {choosing ? (
          <div className={s.repl}>
            <div>
              <div className={s.replLabel} id={`seat-${r.id}`}>Replaced by · from People Management</div>
              <div className={s.seats} role="radiogroup" aria-labelledby={`seat-${r.id}`}>
                {options.map(o => (
                  <button key={o.id || 'release'} type="button" role="radio" aria-checked={seat === o.id} className={s.seat} onClick={() => setSeat(o.id)}>
                    {o.label}
                    {/* Always there, as in the handoff: an empty one still keeps its 6px. */}
                    <span className={s.seatMeta}>{o.meta}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={s.when}>
              <span className={s.replLabel}>Effective date</span>
              <input type="date" className={s.date} value={date} onChange={e => setDate(e.target.value)} aria-label="Effective date" />
              <span className={s.whenText}>{date ? effectiveWhen(date, today) : ''}</span>
            </div>
          </div>
        ) : null}

        {open || choosing ? (
          <label className={s.noteField}>
            <span className={s.noteLabel}>Review notes / reason</span>
            <textarea
              className={s.note}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Explain requests for information, rejections or manual changes"
            />
          </label>
        ) : null}

        {acts.length > 0 || choosing ? (
          <div className={s.actions}>
            {acts.map(a => (
              <button key={a.label} type="button" className={s.action} data-primary={a.primary ? 'true' : undefined} disabled={busy || !can} onClick={() => run(a)}>
                {a.label}
              </button>
            ))}
            {choosing ? (
              <button
                type="button"
                className={s.action}
                data-primary="true"
                disabled={busy || !can || !date}
                onClick={() => approve(r, seat, successor, date, sub)}
              >
                {approveLabel(date)}
              </button>
            ) : null}
            {error ? <span className={s.error} role="alert">{error}</span> : null}
          </div>
        ) : null}
        {notice ? <div className={s.notice}>{notice}</div> : null}
        {/* With no buttons (a scheduled replacement's link, an invoice), a refusal reads under the notice. */}
        {acts.length === 0 && !choosing && error ? <p className={s.runFailure} role="alert">{error}</p> : null}
        {failure ? <p className={s.runFailure} role="alert">{failure}</p> : null}
      </div>

      <div className={s.history}>
        <SecLabel style={{ marginBottom: 10 }}>Audit history</SecLabel>
        <div>
          {history.map((e, i) => (
            <HistoryEvent key={i} what={e.what} when={shortDay(e.at)} who={e.by ?? undefined} note={e.note ?? undefined} />
          ))}
          {history.length === 0 ? <p className={s.empty} style={{ margin: 0 }}>Nothing recorded yet.</p> : null}
        </div>
      </div>
    </>
  )
}
