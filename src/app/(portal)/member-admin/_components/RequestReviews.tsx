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
  filterRequests,
  isOpen,
  requestCaption,
  requestFacts,
  requestHistory,
  requestMeta,
  requestStatus,
  requestStep,
  requestTitle,
  type RequestFacts,
  type RequestFilter,
} from '@/lib/member/member-services'
import s from './member-services.module.css'

type Act = { label: string; primary?: boolean; needsNote?: boolean; input: AdminMemberInput; done: string }

/**
 * Member services › Request reviews (2026-10-10, the HR revamp): every request
 * on the left (All · Claim · Replacement · Waiting list), the open one on the
 * right — its facts, the step HR takes, the note, the buttons, and its audit
 * history. A waiting-list applicant is accepted here and then transferred or
 * failed on Sales Groups; a claim is decided here, once, into payroll or as a
 * payment request; a replacement keeps today's approve → link → confirm steps
 * until it gets its automatic run (PR4b).
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
  const [candidate, setCandidate] = useState('')
  const [checked, setChecked] = useState(false)

  const shown = filterRequests(data.requests, filter)
  const selected = data.requests.find(r => r.id === picked) ?? shown[0] ?? null

  function open(id: string) {
    setPicked(id)
    setNote('')
    setError('')
    setCandidate('')
    setChecked(false)
  }

  async function run(act: Act) {
    if (busy) return
    if (act.needsNote && !note.trim()) {
      setError('Write a review note first — it goes on the record.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await adminMemberAction(act.input)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (act.input.action === 'invoice') {
        const url = (result.data as { url?: string } | null)?.url
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
        return
      }
      setNote('')
      setChecked(false)
      flash(act.done)
    } catch {
      setError('The action could not be completed. Please try again.')
    } finally {
      setBusy(false)
    }
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
            candidate={candidate}
            setCandidate={setCandidate}
            checked={checked}
            setChecked={setChecked}
            run={run}
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
  candidate,
  setCandidate,
  checked,
  setChecked,
  run,
}: {
  r: MemberRequest
  data: AdminMemberData
  facts: RequestFacts | undefined
  note: string
  setNote: (v: string) => void
  error: string
  busy: boolean
  candidate: string
  setCandidate: (v: string) => void
  checked: boolean
  setChecked: (v: boolean) => void
  run: (act: Act) => void
}) {
  const st = requestStatus(r.status)
  const sub = data.departments.find(d => d.id === String(r.detail.subDepartmentId ?? ''))?.name ?? null
  const name = String(r.detail.newPerson ?? '').trim() || 'The applicant'
  const open = isOpen(r)
  const can = data.canManageRequests
  const base = { requestId: r.id }
  const moreInfo: Act = { label: 'Request more information', needsNote: true, input: { action: 'needs_info', ...base, note }, done: 'Sent back for more information' }
  const reject: Act = { label: 'Reject', needsNote: true, input: { action: 'reject', ...base, note }, done: 'Request rejected' }

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
    acts = [moreInfo, reject, {
      label: 'Approve arrangement',
      primary: true,
      input: { action: 'approve', ...base, note: note.trim() || 'Arrangement approved.' },
      done: 'Arrangement approved — complete it in People Management, then confirm it here',
    }]
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
  } else if (r.kind === 'claim') {
    const where = claimPayoutLine(readClaimPayout(r.payout), r.status, 'hr')
    if (where) notice = where
  }

  const caption = requestCaption(r, sub)
  const history = requestHistory(facts)
  const signature = typeof r.detail.signatureImage === 'string' && /^data:image\/png;base64,/.test(r.detail.signatureImage) ? r.detail.signatureImage : null
  const linkedId = String(r.detail.allocatedStaffId ?? '')
  const vacancy = r.detail.replacementSource === 'vacancy'
  const effective = String(r.detail.effective ?? '')
  const due = !effective || effective <= officeToday()
  const matches = data.candidates.filter(c => c.name.trim().toLowerCase() === name.toLowerCase())

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
          ...requestFacts(r, facts, data),
          ...(r.kind === 'claim' && r.claimId
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

        {r.kind === 'replacement' && r.status === 'approved' ? (
          <div className={s.arrange}>
            {vacancy ? null : linkedId ? (
              <div className={s.arrangeRow}>
                <span className={s.arrangeLabel}>Replaced by</span>
                <b style={{ fontWeight: 500 }}>{facts?.successor ?? data.candidates.find(c => c.id === linkedId)?.name ?? 'Linked'}</b>
              </div>
            ) : (
              <div className={s.arrangeRow}>
                <span className={s.arrangeLabel}>Replaced by · from People Management</span>
                <select className={s.select} value={candidate} onChange={e => setCandidate(e.target.value)} aria-label="Replaced by">
                  <option value="">{matches.length ? 'Choose their staff record' : `No staff record named ${name} yet`}</option>
                  {matches.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className={s.action}
                  disabled={busy || !can || !candidate}
                  onClick={() => run({ label: 'Link', input: { action: 'bind_candidate', ...base, staffId: candidate, note }, done: 'Replacement linked' })}
                >
                  Link
                </button>
              </div>
            )}
            <label className={s.check}>
              <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
              <span>I have checked the original member&apos;s arrangement, the replacement&apos;s place and the effective date in People Management and Revenue.</span>
            </label>
          </div>
        ) : null}

        {open || (r.kind === 'replacement' && r.status === 'approved') ? (
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

        <div className={s.actions}>
          {acts.map(a => (
            <button key={a.label} type="button" className={s.action} data-primary={a.primary ? 'true' : undefined} disabled={busy || !can} onClick={() => run(a)}>
              {a.label}
            </button>
          ))}
          {r.kind === 'replacement' && r.status === 'approved' ? (
            <button
              type="button"
              className={s.action}
              data-primary="true"
              disabled={busy || !can || !checked || !due || (!vacancy && !linkedId)}
              title={!due ? `Not before ${effective}` : undefined}
              onClick={() => run({ label: 'Confirm', input: { action: 'execute', ...base, note }, done: 'Marked completed' })}
            >
              Confirm change completed
            </button>
          ) : null}
          {error ? <span className={s.error} role="alert">{error}</span> : null}
        </div>
        {notice ? <div className={s.notice}>{notice}</div> : null}
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
