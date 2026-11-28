'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChipTone } from '@/components/finv/Hub'
import { useRequestUploads } from '@/app/(portal)/claims/_components/useRequestUploads'
import {
  approveCards, approveHero, canCancel, canEdit, draftOf, draftPayload, draftTotal, emptyDraft, emptyItem, payeePatch, payeePerson, PR_ACCEPT,
  PR_LIMITS, payToWords, requestDay, rmOf, routeWords, rowsOfApproveCard, rowsOfStaffCard, saveProblem, staffCards, staffHero, submitProblem,
  waitsForMe, whatOf, whereItIs, whereItIsNote, whoPaysWords,
  type ApprovalRead, type DraftItem, type PaymentRequest, type RequestContext, type RequestDraft, type RequestFile,
} from '@/lib/payment-requests/model'
import type { AppClaims, Tone } from '@/lib/mkt-app/model'
import { officeDay } from '@/lib/office-time'
import { BackStep, Pill } from '../kit'
import { Shell } from './TaskScreen'
import s from '../mkt-app.module.css'

// Claim — and Claim & approve for whoever holds it (`Marketing App iOS + Android.dc.html` › Claim; the portal's Claim
// page, app/(portal)/claims — its model lib/payment-requests/model.ts and its Server Actions, every word of a status
// theirs): the dark hero, the cards as chips, a search, the requests; a request's page; New request on the New request
// window's own rules (nothing chosen until it is picked, each receipt straight into the bucket — useRequestUploads). A
// request waiting for the holder has a tick box: Approve or Reject (a reason) the ticked together.

type Answer<T> = { ok: true; data: T } | { ok: false; reason: string }

export interface ClaimActions {
  openNew: () => Promise<Answer<RequestContext>>
  save: (id: string | null, payload: unknown, submit: boolean) => Promise<Answer<PaymentRequest>>
  cancel: (id: string) => Promise<Answer<PaymentRequest>>
  approve: (ids: string[]) => Promise<Answer<{ approved: number }>>
  sendBack: (ids: string[], reason: string) => Promise<Answer<{ sentBack: number }>>
  openFile: (fileId: string) => Promise<Answer<{ url: string; name: string }>>
}

export interface ClaimScreenProps {
  claims: AppClaims
  /** Claim & approve: Claims · View at Dept. */
  approver: boolean
  meName: string
  /** A request to open at once (a tapped notice). */
  open: string | null
  actions: ClaimActions
  say: (text: string) => void
  onBack: () => void
  refresh: () => void
  askReason: (to: string, send: (reason: string) => Promise<string | null>) => void
}

const CHIP_TONE: Record<ChipTone, Tone> = { def: 'draft', wait: 'wait', accent: 'meet', ledger: 'done', info: 'draft', danger: 'red', alert: 'wait' }
const KIND_WORDS = { claim: 'Claim', direct_pay: 'Direct pay' } as const
const sentWords = (r: PaymentRequest) => (r.status === 'pending_approval' ? 'Sent for approval' : 'Sent to Finance')
const several = (n: number) => `${n} request${n === 1 ? '' : 's'}`

/** The form open: a new request, or one of the reader's being changed (a draft, or one sent back). */
interface FormState {
  request: PaymentRequest | null
}

export default function ClaimScreen(p: ClaimScreenProps) {
  const [mine, setMine] = useState<PaymentRequest[]>(p.claims.mine)
  const [approval, setApproval] = useState<ApprovalRead | null>(p.claims.approval)
  const holder = p.approver && !!approval
  const [card, setCard] = useState<string>(holder ? 'to_approve' : 'all')
  const [q, setQ] = useState('')
  const [ticks, setTicks] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(p.open)
  const [form, setForm] = useState<FormState | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // The app read again behind a write: its lists replace ours.
  useEffect(() => { setMine(p.claims.mine) }, [p.claims.mine])
  useEffect(() => { setApproval(p.claims.approval) }, [p.claims.approval])

  const all = useMemo(() => {
    const byId = new Map<string, PaymentRequest>()
    for (const r of [...(approval?.requests ?? []), ...mine]) byId.set(r.id, r)
    return byId
  }, [approval, mine])
  const opened = openId ? all.get(openId) ?? null : null

  const cards = holder && approval
    ? approveCards(approval, mine).map(c => ({ key: c.key, label: c.label, n: rowsOfApproveCard(approval, mine, c.key).length }))
    : staffCards(mine).map(c => ({ key: c.key, label: c.label, n: rowsOfStaffCard(mine, c.key).length }))
  const hero = holder && approval ? approveHero(approval) : staffHero(mine)
  const rows = (holder && approval ? rowsOfApproveCard(approval, mine, card) : rowsOfStaffCard(mine, card)).filter(r => {
    const t = q.trim().toLowerCase()
    return !t || `${whatOf(r)} ${r.requestNo ?? ''} ${r.requesterName} ${r.payeeName ?? ''}`.toLowerCase().includes(t)
  })
  const tickable = (r: PaymentRequest) => holder && !!approval?.canApprove && card !== 'mine' && waitsForMe(r)
  const ticked = rows.filter(r => ticks.includes(r.id) && tickable(r))

  /** A request written: put back in the lists, and the app reads again behind it. */
  const put = (r: PaymentRequest) => {
    setMine(cur => (r.mine ? [r, ...cur.filter(x => x.id !== r.id)] : cur))
    setApproval(cur => (cur ? { ...cur, requests: cur.requests.map(x => (x.id === r.id ? r : x)) } : cur))
    p.refresh()
  }
  const decided = (list: PaymentRequest[], patch: Partial<PaymentRequest>) =>
    setApproval(cur => (cur ? { ...cur, requests: cur.requests.map(x => (list.some(l => l.id === x.id) ? { ...x, ...patch } : x)) } : cur))

  const approve = (list: PaymentRequest[]) => {
    if (busy || !list.length) return
    setBusy(true)
    void p.actions.approve(list.map(r => r.id)).then(res => {
      setBusy(false)
      if (!res.ok) return p.say(res.reason)
      // A request opened stays open, showing where it went (closing it here would be a second Back with the sheet's).
      decided(list, { status: 'with_finance', approvedByName: p.meName, reviewers: null })
      setTicks([])
      p.say(`${several(res.data.approved)} approved — with Finance now`)
      p.refresh()
    }, () => { setBusy(false); p.say('It could not be approved. Please try again.') })
  }
  const sendBack = (list: PaymentRequest[]) => {
    if (busy || !list.length) return
    const to = list.length === 1
      ? `Back to ${list[0].requesterName} · ${whatOf(list[0])}`
      : `${several(list.length)} · ${rmOf(list.reduce((t, r) => t + r.total, 0))}`
    p.askReason(to, async reason => {
      const res = await p.actions.sendBack(list.map(r => r.id), reason)
      if (!res.ok) return res.reason
      decided(list, { status: 'rejected', rejectReason: reason, rejectedByName: p.meName, rejectedStage: 'approval', reviewers: null })
      setTicks([])
      p.say(`${several(res.data.sentBack)} sent back`)
      p.refresh()
      return null
    })
  }

  const submitDraft = (r: PaymentRequest) => {
    if (busy) return
    const payload = draftPayload(draftOf(r), [], [])
    if (!payload) return p.say('Pick what it is first.')
    setBusy(true)
    void p.actions.save(r.id, payload, true).then(res => {
      setBusy(false)
      if (!res.ok) return p.say(res.reason)
      put(res.data)
      p.say(sentWords(res.data))
    }, () => { setBusy(false); p.say('The request could not be sent. Please try again.') })
  }
  const cancel = (r: PaymentRequest) => {
    if (busy) return
    if (!confirmCancel) return setConfirmCancel(true)
    setBusy(true)
    void p.actions.cancel(r.id).then(res => {
      setBusy(false)
      setConfirmCancel(false)
      if (!res.ok) return p.say(res.reason)
      put(res.data)
      setOpenId(null)
      p.say('Request cancelled')
    }, () => { setBusy(false); p.say('The request could not be cancelled. Please try again.') })
  }

  const formTitle = !form ? '' : !form.request ? 'New request' : form.request.status === 'rejected' ? 'Fix and send again' : 'Edit request'
  const title = form ? formTitle : opened ? opened.requestNo || 'Draft' : holder ? 'Claim & approve' : 'Claim'
  const inside = !!form || !!opened
  const closeForm = () => setForm(null)
  const closeOpened = () => { setConfirmCancel(false); setOpenId(null) }
  const back = () => {
    if (form) return closeForm()
    if (opened) return closeOpened()
    p.onBack()
  }
  // The phone's Back, a step a layer, nested: the request opened, the form over it (or over the list) — one layer at a time
  // opens or closes, never one for another (MktApp › Moving about).
  return (
    <Shell title={title} sub={!inside && holder ? approval?.departmentName : undefined} onBack={back}>
      {opened ? <BackStep k="mkt-app-claim-open" onBack={closeOpened} /> : null}
      {form ? <BackStep k="mkt-app-claim-form" onBack={closeForm} /> : null}
      {form ? (
        // Saved: back to where it was opened from — the request (shown as it now is) or the list, the new one first.
        <ClaimForm key={form.request?.id ?? 'new'} request={form.request} actions={p.actions}
          onSaved={(r, sent) => { put(r); setForm(null); p.say(sent ? sentWords(r) : 'Saved as draft') }} />
      ) : opened ? (
        <Detail r={opened} busy={busy} confirmCancel={confirmCancel} openFile={p.actions.openFile} say={p.say}
          approver={holder && !!approval?.canApprove && waitsForMe(opened)}
          onEdit={() => { setConfirmCancel(false); setForm({ request: opened }) }}
          onSubmit={() => submitDraft(opened)} onCancel={() => cancel(opened)}
          onApprove={() => approve([opened])} onReject={() => sendBack([opened])} />
      ) : (
        <>
          <div className={s.scroll}>
            <div className={s.claimBody}>
              <div className={s.hero}>
                <span className={s.heroLabel}>{hero.label}</span>
                <span className={s.heroValue}>{hero.value}</span>
              </div>
              <div className={s.chipRow}>
                {cards.map(c => (
                  <button key={c.key} type="button" className={s.chip} data-on={card === c.key ? 'true' : 'false'} onClick={() => { setCard(c.key); setTicks([]) }}>
                    {c.label} <b>{c.n}</b>
                  </button>
                ))}
              </div>
              {p.claims.error ? <div className={s.formBad}>{p.claims.error}</div> : null}
              <input className={`${s.search} ${s.searchWhite}`} type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search requests"
                placeholder={holder ? 'Search who, what, reference…' : 'Search what, reference, pay to…'} />
              {rows.map(r => {
                const w = whereItIs(r)
                const note = whereItIsNote(r)
                const on = ticks.includes(r.id)
                return (
                  <div key={r.id} className={s.claim} data-gone={r.status === 'cancelled' ? 'true' : 'false'} role="button" tabIndex={0}
                    onClick={() => setOpenId(r.id)} onKeyDown={e => { if (e.key === 'Enter') setOpenId(r.id) }}>
                    {tickable(r) ? (
                      <button type="button" className={s.tick} aria-pressed={on} aria-label={`Tick ${whatOf(r)}`}
                        onClick={e => { e.stopPropagation(); setTicks(t => (on ? t.filter(x => x !== r.id) : [...t, r.id])) }}>
                        <span className={s.tickBox} data-on={on ? 'true' : 'false'}>{on ? '✓' : ''}</span>
                      </button>
                    ) : null}
                    <div className={s.claimMain}>
                      <div className={s.claimTop}>
                        <span className={s.claimWhat}>{whatOf(r)}</span>
                        <span className={s.claimAmt}>{rmOf(r.total)}</span>
                      </div>
                      <div className={s.claimSub}>{[requestDay(r), KIND_WORDS[r.kind], r.mine ? r.requestNo : r.requesterName].filter(Boolean).join(' · ')}</div>
                      <div className={s.claimChips}>
                        <Pill tone={CHIP_TONE[w.tone] ?? 'draft'} text={w.text} size="sm" />
                        {note ? <span className={s.claimNote}>{note}</span> : null}
                      </div>
                    </div>
                  </div>
                )
              })}
              {rows.length ? null : (
                <div className={s.emptyTall}>
                  {q.trim() ? 'No requests here.' : card === 'to_approve' ? 'Nothing waits for your approval.' : 'No requests yet.'}
                </div>
              )}
            </div>
          </div>
          {ticked.length ? (
            <div className={s.bar}>
              <div className={s.barLineInk}>{ticked.length} selected · {rmOf(ticked.reduce((t, r) => t + r.total, 0))}</div>
              <div className={s.barRow}>
                <button type="button" className={s.btn} data-kind="danger" disabled={busy} onClick={() => sendBack(ticked)}>Reject</button>
                <button type="button" className={s.btn} data-kind="primary" disabled={busy} style={{ flex: 1.4 }} onClick={() => approve(ticked)}>Approve</button>
              </div>
            </div>
          ) : p.claims.canCreate ? (
            <div className={s.bar}>
              <button type="button" className={s.btn} data-kind="primary" onClick={() => setForm({ request: null })}>+ New request</button>
            </div>
          ) : null}
        </>
      )}
    </Shell>
  )
}

function Detail({ r, busy, confirmCancel, approver, openFile, say, onEdit, onSubmit, onCancel, onApprove, onReject }: {
  r: PaymentRequest
  busy: boolean
  confirmCancel: boolean
  approver: boolean
  openFile: ClaimActions['openFile']
  say: (t: string) => void
  onEdit: () => void
  onSubmit: () => void
  onCancel: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const w = whereItIs(r)
  const note = whereItIsNote(r)
  // A receipt by a five-minute link, its tab opened in the tap itself (a phone blocks a window opened after the answer).
  const show = async (f: RequestFile) => {
    const tab = window.open('', '_blank')
    const res = await openFile(f.id).catch(() => ({ ok: false as const, reason: 'The file could not be opened. Please try again.' }))
    if (res.ok && tab) tab.location.href = res.data.url
    else {
      tab?.close()
      if (!res.ok) say(res.reason)
    }
  }
  const lines: [string, string][] = [
    ['Ref #', r.requestNo || 'Draft'],
    ['Date', requestDay(r)],
    ['From', r.requesterName],
    ['Pay', r.kind === 'claim' ? 'Claim — pay it back' : 'Pay a supplier directly'],
    ['Borne by', whoPaysWords(r)],
    ...(r.items.length > 1 ? r.items.map((i, k): [string, string] => [`Item ${k + 1}`, `${i.description} · ${rmOf(i.amount)}`]) : []),
  ]
  const buttons: { key: string; label: string; kind?: 'primary' | 'danger'; flex?: number; go: () => void }[] = []
  if (canCancel(r)) buttons.push({ key: 'cancel', label: confirmCancel ? 'Tap again to cancel' : 'Cancel request', kind: 'danger', go: onCancel })
  if (canEdit(r)) buttons.push({ key: 'edit', label: r.status === 'rejected' ? 'Fix and send again' : 'Edit', flex: 1.3, go: onEdit })
  if (r.mine && r.status === 'draft') buttons.push({ key: 'submit', label: 'Submit', kind: 'primary', go: onSubmit })
  if (approver) {
    buttons.push({ key: 'reject', label: 'Reject', kind: 'danger', go: onReject })
    buttons.push({ key: 'approve', label: 'Approve — send to Finance', kind: 'primary', flex: 2, go: onApprove })
  }
  return (
    <>
      <div className={s.scroll}>
        <div className={s.claimBody} style={{ gap: 14 }}>
          <div className={s.detail}>
            <div className={s.detailHead}>
              <span className={`${s.label} ${s.grow}`}>{r.kind === 'claim' ? 'Claim' : 'Direct payment'}</span>
              <Pill tone={CHIP_TONE[w.tone] ?? 'draft'} text={w.text} size="task" />
            </div>
            <div className={s.amount30}>{rmOf(r.total)}</div>
            <div className={s.what16}>{whatOf(r)}</div>
            <div className={s.payTo}>Pay to {payToWords(r)}</div>
            {note ? <div className={s.detailNote}>{note}</div> : null}
          </div>
          {r.status === 'rejected' && r.rejectReason ? (
            <div className={s.reason}>
              <div className={`${s.label} ${s.reasonLabel}`}>Sent back</div>
              <div className={s.reasonText}>“{r.rejectReason}”</div>
              <div className={s.reasonBy}>{[r.rejectedByName ?? (r.rejectedStage === 'finance' ? 'Finance' : null), r.rejectedAt ? requestDayOf(r.rejectedAt) : null].filter(Boolean).join(' · ')}</div>
            </div>
          ) : null}
          <div className={s.dl}>
            {lines.map(([k, v]) => <div key={k} className={s.dlRow}><span className={s.dlK}>{k}</span><span className={s.dlV}>{v}</span></div>)}
          </div>
          <div className={s.files}>
            <span className={s.label}>Receipts</span>
            {r.files.map(f => (
              <button key={f.id} type="button" className={s.receipt} onClick={() => void show(f)}>
                <span className={s.receiptName}>📎 {f.name}</span>
                <span className={s.chev}>›</span>
              </button>
            ))}
            {r.files.length ? null : <div className={s.formRoute}>No receipt attached.</div>}
          </div>
        </div>
      </div>
      {buttons.length ? (
        <div className={s.bar}>
          <div className={s.barRow}>
            {buttons.map(b => (
              <button key={b.key} type="button" className={s.btn} data-kind={b.kind} disabled={busy} style={b.flex ? { flex: b.flex } : undefined} onClick={b.go}>{b.label}</button>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

/** YYYY-MM-DD of an instant, the office's (as a request's own day is shown). */
const requestDayOf = (at: string) => officeDay(at).format('YYYY-MM-DD')

/**
 * New request (or one of the reader's being changed): the New request window's own rules (`saveProblem`,
 * `submitProblem`, the database's after them), nothing chosen until it is picked. What it is, its items, who is paid and
 * where, who bears it (another department's pool, or a split made on the computer, kept as it is), the receipts.
 */
function ClaimForm({ request, actions, onSaved }: {
  request: PaymentRequest | null
  actions: ClaimActions
  onSaved: (r: PaymentRequest, sent: boolean) => void
}) {
  const [draft, setDraft] = useState<RequestDraft>(() => (request ? draftOf(request) : emptyDraft()))
  const [removed, setRemoved] = useState<string[]>([])
  const [ctx, setCtx] = useState<RequestContext | null>(null)
  const [bad, setBad] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const filed = (request?.files ?? []).filter(f => !removed.includes(f.id))
  const uploads = useRequestUploads(filed.length)
  const { discard } = uploads
  const openNew = actions.openNew

  useEffect(() => {
    let live = true
    void openNew().then(res => {
      if (!live) return
      if (res.ok) setCtx(res.data)
      else setBad(res.reason)
    }, () => { if (live) setBad('The form could not be opened. Please try again.') })
    return () => { live = false }
  }, [openNew])
  // Closed without saving: what went up comes down again.
  const saved = useRef(false)
  useEffect(() => () => { if (!saved.current) discard() }, [discard])

  const set = (patch: Partial<RequestDraft>) => { setDraft(d => ({ ...d, ...patch })); setBad(null) }
  const setItem = (i: number, patch: Partial<DraftItem>) => {
    setDraft(d => ({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))
    setBad(null)
  }

  const salary = ctx?.salaryAccount ?? null
  // Pay to: oneself until changed — a person on People picked, or a name typed (the window's PartyInput, here a list).
  const isMe = draft.payToName === null || (!!ctx && draft.payToStaffId === ctx.staffId)
  const person = payeePerson(draft, ctx)
  const payToName = draft.payToName ?? ctx?.name ?? ''
  const typedName = !isMe && !draft.payToStaffId
  const account = draft.kind === 'direct_pay' || (draft.kind === 'claim' && draft.salary === false && !!payToName.trim())
  const fileCount = filed.length + uploads.uploads.length
  const waiting = uploads.busy ? 'Wait for the files to finish uploading.' : uploads.failed ? 'Take off the files that did not upload.' : null
  const bearers = ctx?.departments ?? []

  const save = (submit: boolean) => {
    if (busy || !ctx) return
    const problem = waiting ?? (submit ? submitProblem(draft, fileCount, ctx) : saveProblem(draft))
    if (problem) return setBad(problem)
    const payload = draftPayload(draft, uploads.uploads, removed)
    if (!payload) return setBad('Pick what it is first.')
    setBusy(true)
    void actions.save(request?.id ?? null, payload, submit).then(res => {
      setBusy(false)
      if (!res.ok) return setBad(res.reason)
      saved.current = true
      uploads.filed()
      onSaved(res.data, submit)
    }, () => { setBusy(false); setBad('The request could not be saved. Please try again.') })
  }

  const kinds = [
    { key: 'claim' as const, emoji: '🧾', label: 'Claim', sub: 'I paid — pay me back', patch: { kind: 'claim' as const, supplier: '' } },
    { key: 'direct_pay' as const, emoji: '🏦', label: 'Direct payment', sub: 'Pay the supplier', patch: { kind: 'direct_pay' as const, salary: null } },
  ]
  return (
    <>
      <div className={s.scroll}>
        <div className={s.formBody}>
          {request?.status === 'rejected' && request.rejectReason ? (
            <div className={s.reason}>
              <div className={`${s.label} ${s.reasonLabel}`}>Sent back by {request.rejectedByName ?? 'Finance'}</div>
              <div className={s.reasonText}>“{request.rejectReason}”</div>
            </div>
          ) : null}
          <div className={s.kinds} role="radiogroup" aria-label="What is it?">
            {kinds.map(k => (
              <button key={k.key} type="button" role="radio" aria-checked={draft.kind === k.key} className={s.kind} data-on={draft.kind === k.key ? 'true' : 'false'} onClick={() => set(k.patch)}>
                <div className={s.kindEmoji}>{k.emoji}</div>
                <div className={s.kindLabel}>{k.label}</div>
                <div className={s.kindSub}>{k.sub}</div>
              </button>
            ))}
          </div>
          {draft.kind ? (
            <>
              <div className={s.formGroup}>
                {draft.items.map((it, i) => (
                  <div key={i} className={s.formGroup}>
                    <div>
                      <div className={s.fLabel}>{draft.items.length > 1 ? `Item ${i + 1}` : 'What is it for'} <span className={s.req}>*</span></div>
                      <input className={s.input} value={it.description} maxLength={PR_LIMITS.words} placeholder="e.g. Props for the shoot"
                        aria-label={`Item ${i + 1} description`} onChange={e => setItem(i, { description: e.target.value })} />
                    </div>
                    <div>
                      <div className={s.fLabel}>Amount (RM) <span className={s.req}>*</span></div>
                      <input className={`${s.input} ${s.inputMono}`} value={it.amount} inputMode="decimal" placeholder="0.00"
                        aria-label={`Item ${i + 1} amount`} onChange={e => setItem(i, { amount: e.target.value })} />
                    </div>
                    {draft.items.length > 1 ? (
                      <button type="button" className={s.addLine} onClick={() => setDraft(d => ({ ...d, items: d.items.filter((_, j) => j !== i) }))}>Remove item {i + 1}</button>
                    ) : null}
                  </div>
                ))}
                <button type="button" className={s.addLine} disabled={draft.items.length >= PR_LIMITS.items}
                  onClick={() => setDraft(d => ({ ...d, items: [...d.items, emptyItem()] }))}>+ Add another item</button>
                {draft.items.length > 1 ? <div className={s.formTotal}><span>Total</span><b>{rmOf(draftTotal(draft))}</b></div> : null}
              </div>

              {draft.kind === 'claim' ? (
                <div className={s.formGroup}>
                  <div>
                    <div className={s.fLabel}>Pay to <span className={s.req}>*</span></div>
                    <input className={s.input} list="mkt-app-pay-to" value={payToName} placeholder="Pick a person or type a name" aria-label="Pay to"
                      onChange={e => set(payeePatch(draft, e.target.value, '', ctx))} />
                    <datalist id="mkt-app-pay-to">
                      {(ctx?.people ?? []).map(x => <option key={x.id} value={x.name}>{x.id === ctx?.staffId ? 'You' : x.department}</option>)}
                    </datalist>
                  </div>
                  {typedName ? null : (
                    <div className={s.chips} role="radiogroup" aria-label="Pay into">
                      <button type="button" role="radio" aria-checked={draft.salary === true} className={`${s.chip} ${s.choice}`} data-on={draft.salary === true ? 'true' : 'false'}
                        disabled={isMe ? !salary : !person?.hasSalary} onClick={() => set({ salary: true, bank: '', accountNo: '' })}>
                        {isMe
                          ? salary ? `My salary account · ${salary.bank} •••• ${salary.last4}` : ctx ? 'HR has no salary account for you' : 'My salary account'
                          : person?.hasSalary ? `${payToName}’s salary account` : 'HR has no salary account for them'}
                      </button>
                      <button type="button" role="radio" aria-checked={draft.salary === false} className={`${s.chip} ${s.choice}`} data-on={draft.salary === false ? 'true' : 'false'}
                        onClick={() => set({ salary: false })}>Another account this time</button>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className={s.fLabel}>Supplier <span className={s.req}>*</span></div>
                  <input className={s.input} value={draft.supplier} maxLength={200} placeholder="The name on their invoice" aria-label="Supplier" onChange={e => set({ supplier: e.target.value })} />
                </div>
              )}
              {account ? (
                <div className={s.formGroup}>
                  <div>
                    <div className={s.fLabel}>Bank <span className={s.req}>*</span></div>
                    <input className={s.input} value={draft.bank} maxLength={120} placeholder="e.g. Maybank" aria-label="Bank" onChange={e => set({ bank: e.target.value })} />
                  </div>
                  <div>
                    <div className={s.fLabel}>Account number <span className={s.req}>*</span></div>
                    <input className={`${s.input} ${s.inputMono}`} value={draft.accountNo} maxLength={40} inputMode="numeric" aria-label="Account number" onChange={e => set({ accountNo: e.target.value })} />
                  </div>
                </div>
              ) : null}

              <div className={s.formGroup}>
                <div className={s.fLabel} style={{ marginBottom: 0 }}>Who bears it <span className={s.req}>*</span></div>
                <div className={s.chips} role="radiogroup" aria-label="Who bears it?">
                  <button type="button" role="radio" aria-checked={draft.bears === 'own'} className={`${s.chip} ${s.choice}`} data-on={draft.bears === 'own' ? 'true' : 'false'}
                    onClick={() => set({ bears: 'own' })}>{ctx ? ctx.departmentName : 'My department'}</button>
                  <button type="button" role="radio" aria-checked={draft.bears === 'other'} className={`${s.chip} ${s.choice}`} data-on={draft.bears === 'other' ? 'true' : 'false'}
                    onClick={() => set({ bears: 'other' })}>Another department</button>
                  {draft.bears === 'split' ? (
                    <button type="button" role="radio" aria-checked className={`${s.chip} ${s.choice}`} data-on="true" disabled>Split · {draft.shares.length}</button>
                  ) : null}
                </div>
                {draft.bears === 'other' ? (
                  <select className={s.input} value={draft.other} aria-label="Which department bears it" onChange={e => set({ other: e.target.value })}>
                    <option value="">Which department</option>
                    {bearers.map(o => <option key={o.id} value={o.id}>{o.venture ? `Venture (${o.name})` : o.name}</option>)}
                  </select>
                ) : null}
              </div>

              <div className={s.files}>
                <span className={s.fLabel} style={{ marginBottom: 0 }}>Receipts or invoices <span className={s.req}>*</span></span>
                {filed.map(f => (
                  <div key={f.id} className={s.receipt}>
                    <span className={s.receiptName}>📎 {f.name}</span>
                    <button type="button" className={s.receiptX} aria-label={`Remove ${f.name}`} onClick={() => setRemoved(x => [...x, f.id])}>✕</button>
                  </div>
                ))}
                {uploads.items.map(f => (
                  <div key={f.key} className={s.receipt}>
                    <span className={s.receiptName}>📎 {f.name}{f.state === 'uploading' ? ' · Uploading…' : f.state === 'failed' ? ` · ${f.error ?? 'Not uploaded'}` : ''}</span>
                    <button type="button" className={s.receiptX} aria-label={`Remove ${f.name}`} onClick={() => uploads.remove(f.key)}>✕</button>
                  </div>
                ))}
                <button type="button" className={s.drop} disabled={uploads.full} onClick={() => pick.current?.click()}>📷 Take a photo or pick a file</button>
                <input ref={pick} type="file" accept={PR_ACCEPT} hidden multiple onChange={e => { uploads.add(Array.from(e.target.files ?? [])); e.target.value = '' }} />
              </div>
            </>
          ) : null}
          {bad ? <div className={s.formBad} role="alert">{bad}</div> : null}
          <div className={s.formRoute}>{routeWords(ctx)}</div>
        </div>
      </div>
      <div className={s.bar}>
        <div className={`${s.barGrid} ${s.barGrid15}`}>
          <button type="button" className={s.btn} disabled={busy || !ctx} onClick={() => save(false)}>Save as draft</button>
          <button type="button" className={s.btn} data-kind="primary" disabled={busy || !ctx} onClick={() => save(true)}>Submit</button>
        </div>
      </div>
    </>
  )
}
