'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Drawer } from '@/components/hrv/overlay'
import { acknowledgeProbation } from '@/app/(portal)/team/people/probation-actions'
import { acknowledgeContract } from '@/app/(portal)/team/people/contract-actions'
import { NOTICE_DAYS, termEndLine } from '@/lib/employment-status'
import { officeToday } from '@/lib/office-time'
import { TERM_KINDS, TERM_LABEL, ackLine, acknowledged, dueReviews, reviewsFromRow, waitingCount, type TermKind, type TermReview } from '@/lib/term-reviews'
import MemoCard, { openMemoFileIn } from '@/components/memos/MemoCard'
import SignaturePad, { SignatureImage } from '@/components/memos/SignaturePad'
import { markMyMemo, myMemoSignature, openMemoFile } from '@/lib/memos/actions'
import {
  ackedLine, memoBellCount, memoDay, memoHeading, memoUnread, memoWaiting, memosInOrder, myMemosFromRow, type MyMemo,
} from '@/lib/memos/model'
import { createClient } from '@/lib/supabase/client'
import s from './memo-bell.module.css'

/**
 * The portal's memo bell (2026-10-12 — the user: "我在任何一个 view 都可以收到那个
 * notification，那我只需要 acknowledge 一次，我每一个 view 就都当做是 acknowledge
 * 了，因为主要都是我的 account 嘛"). In the top bar of every view — Principal,
 * Finance, HR — for a login of the person's own (a People record names it; the
 * shared logins have no memos), never while viewing as somebody.
 *
 * Its count is every memo not opened yet or still waiting for Acknowledge; it
 * opens a drawer of them, waiting ones first, and a memo opens in the same
 * drawer as its people read it — the file too — with Acknowledge. Opening it
 * is reading it. The receipt is the LOGIN's: acknowledged here, it is
 * acknowledged in the HR app and the Revenue app as well (mig 20261012210000).
 *
 * Read from the browser (`my_memos()`, the login's own session), not through a
 * Server Action: nothing may fire one on its own after a navigation (speed.md).
 * Read again when the drawer opens and when the window comes back into view.
 *
 * Acknowledge is signed (2026-10-20 — the user: "签完之后再来点那个 Acknowledge
 * button"): a memo waiting for them carries the signature pad, and Acknowledge
 * waits for a signature; one they acknowledged shows the signature they gave,
 * read back when it is opened.
 *
 * In HR's view it is the Notifications bell too (2026-10-23 — the user, circling
 * it: "at least show up in this notification side, in desktop view"): a
 * probation ending within NOTICE_DAYS, or past and still open, for whoever may
 * act on it (`seesTermReminders`) — the shared hr@ as well, which has no memos.
 * Read the same way (`probation_reviews()`); Acknowledge records who and when,
 * the name opens their page for the next step. A contract's end the same way
 * (2026-10-24, `contract_reviews()`), and each term is reminded twice — 30 days
 * before, then 15 (the user: "need 30 days and 15 days before remind, 2
 * reminder"): a reminder counts until it is acknowledged, the second again
 * after the first's, and is listed until they are confirmed, extended or
 * renewed past the window, or their employment ends.
 */
export default function MemoBell({ memos: memosOn = true, terms: termsOn = false }: {
  /** One's own memos — a login a People record names. */
  memos?: boolean
  /** HR view's reminders of a probation or a contract ending. */
  terms?: boolean
}) {
  const [memos, setMemos] = useState<MyMemo[] | null>(null)
  const [terms, setTerms] = useState<Record<TermKind, TermReview[] | null>>({ probation: null, contract: null })
  const [ackBusy, setAckBusy] = useState<string | null>(null)
  const [ackError, setAckError] = useState('')
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sig, setSig] = useState<string | null>(null)
  const [signed, setSigned] = useState<ReadonlyMap<string, string>>(() => new Map())

  const read = useCallback(async () => {
    // Each read on its own: a refusal of one leaves the others — and the bell stays as it was.
    const db = createClient() as unknown as SupabaseClient
    // A refusal keeps the list it had — or, never read, none, so the drawer does not wait on it.
    const keep = (kind: TermKind) => (reading: PromiseLike<{ data: unknown; error: unknown }>) =>
      Promise.resolve(reading).then(
        ({ data, error: failed }) => setTerms(prev => ({ ...prev, [kind]: failed ? (prev[kind] ?? []) : reviewsFromRow(data, kind) })),
        () => setTerms(prev => ({ ...prev, [kind]: prev[kind] ?? [] })),
      )
    await Promise.all([
      memosOn
        ? Promise.resolve(db.rpc('my_memos')).then(
            ({ data, error: failed }) => {
              if (!failed) setMemos(myMemosFromRow(data).memos)
            },
            () => undefined,
          )
        : null,
      termsOn ? keep('probation')(db.rpc('probation_reviews')) : null,
      termsOn ? keep('contract')(db.rpc('contract_reviews')) : null,
    ])
  }, [memosOn, termsOn])

  useEffect(() => {
    void read()
    const back = () => {
      if (document.visibilityState === 'visible') void read()
    }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [read])

  const today = officeToday()
  // The probations, then the contracts, each waiting ones first, soonest first.
  const due = TERM_KINDS.map(kind => {
    const list = terms[kind]
    return { kind, rows: list ? dueReviews(list, today) : [], waiting: list ? waitingCount(list, today) : 0 }
  })
  const toAcknowledge = due.map(d => ({ kind: d.kind, n: d.waiting }))
  const count = (memos ? memoBellCount(memos) : 0) + toAcknowledge.reduce((sum, t) => sum + t.n, 0)
  const shown = memos ? memosInOrder(memos) : []
  const picked = pick ? shown.find(m => m.id === pick) ?? null : null
  const waiting = shown.filter(memoWaiting).length
  const word = termsOn ? 'Notifications' : 'Memos'
  const reading = (memosOn && memos === null) || (termsOn && TERM_KINDS.some(kind => terms[kind] === null))
  const anyDue = due.some(d => d.rows.length > 0)
  const sub = termsOn
    ? [
        ...toAcknowledge.map(t => (t.n ? `${t.n} ${t.kind}${t.n === 1 ? '' : 's'} to acknowledge` : null)),
        waiting ? `${waiting} memo${waiting === 1 ? '' : 's'} waiting` : null,
      ].filter(Boolean).join(' · ') || (reading ? 'Reading…' : 'Nothing waiting for you')
    : memos === null ? 'Reading…' : waiting ? `${waiting} waiting for your acknowledgement` : 'Nothing waiting for you'

  // HR acknowledges a term's reminder: who and when, for the end it stands at now.
  async function acknowledgeReview(r: TermReview) {
    if (ackBusy) return
    setAckBusy(r.id)
    setAckError('')
    try {
      const res = await (r.kind === 'contract' ? acknowledgeContract : acknowledgeProbation)(r.id)
      if (!res.ok) return setAckError(res.reason)
      setTerms(prev => ({
        ...prev,
        [r.kind]: prev[r.kind]?.map(x => (x.id === r.id ? { ...x, ackEnd: res.endsOn || x.endsOn, ackName: res.ackName || x.ackName, ackAt: res.ackAt || new Date().toISOString() } : x)) ?? prev[r.kind],
      }))
    } catch {
      setAckError('Could not acknowledge. Check the connection and try again.')
    } finally {
      setAckBusy(null)
    }
  }

  const patch = (id: string, at: { readAt: string | null; acknowledgedAt: string | null }) =>
    setMemos(list => list?.map(m => (m.id === id ? { ...m, readAt: at.readAt ?? m.readAt, acknowledgedAt: at.acknowledgedAt ?? m.acknowledgedAt } : m)) ?? list)

  function openMemo(m: MyMemo) {
    setPick(m.id)
    setError('')
    setSig(null)
    // One they acknowledged: the signature they gave, read back to draw under it.
    if (m.acknowledgedAt && !signed.has(m.id)) {
      void myMemoSignature(m.id).then(png => {
        if (png) setSigned(prev => new Map(prev).set(m.id, png))
      })
    }
    if (!memoUnread(m)) return
    // Opening it is reading it — the login's receipt, in every view.
    patch(m.id, { readAt: new Date().toISOString(), acknowledgedAt: null })
    void markMyMemo(m.id, false)
  }

  async function acknowledge(m: MyMemo) {
    if (busy || !sig) return
    setBusy(true)
    setError('')
    const res = await markMyMemo(m.id, true, sig)
    setBusy(false)
    if (!res.ok) return setError(res.reason)
    setSigned(prev => new Map(prev).set(m.id, sig))
    setSig(null)
    patch(m.id, { readAt: res.readAt, acknowledgedAt: res.acknowledgedAt ?? new Date().toISOString() })
  }

  function openFile(m: MyMemo, mode: 'view' | 'download') {
    setError('')
    void openMemoFileIn(x => openMemoFile(m.id, x), mode).then(refused => {
      if (refused) setError(refused)
    })
  }

  return (
    <>
      <button
        type="button"
        className={s.bell}
        onClick={() => {
          setOpen(true)
          setPick(null)
          setError('')
          void read()
        }}
        aria-label={count ? `${word}, ${count} new` : word}
        title={word}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
          <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
        </svg>
        {count ? <span className={s.dot}>{count > 9 ? '9+' : count}</span> : null}
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={480}
        eyebrow="For you"
        title={picked ? memoHeading(picked) : word}
        sub={picked ? `From ${picked.sender}` : sub}
      >
        {picked ? (
          <div className={s.detail}>
            <button type="button" className={s.back} onClick={() => { setPick(null); setError('') }}>‹ All memos</button>
            <MemoCard memo={picked} onFile={picked.attachment ? mode => openFile(picked, mode) : undefined}>
              {memoWaiting(picked) ? (
                <div className={s.ackBox}>
                  <span className={s.signLabel}>Your signature</span>
                  <SignaturePad value={sig} onChange={setSig} disabled={busy} className={s.sign} />
                  <button type="button" className={s.ack} onClick={() => void acknowledge(picked)} disabled={busy || !sig} aria-busy={busy || undefined}>
                    {busy ? 'Recording…' : 'Acknowledge'}
                  </button>
                  <span className={s.ackNote}>
                    {sig ? 'Your signature, name and time are recorded for HR — once, for every view.' : 'Sign above to acknowledge.'}
                  </span>
                </div>
              ) : picked.acknowledgedAt ? (
                <div className={s.ackBox}>
                  <div className={s.acked}>✓ {ackedLine(picked.acknowledgedAt)}</div>
                  {signed.get(picked.id) ? <SignatureImage src={signed.get(picked.id)!} alt="Your signature" className={s.signed} /> : null}
                </div>
              ) : null}
              {error ? <div className={s.err} role="alert">{error}</div> : null}
            </MemoCard>
          </div>
        ) : (
          <div className={s.list}>
            {/* A probation or a contract ending (HR's view, 2026-10-23 / 10-24): each under its word, those waiting
                for Acknowledge first, soonest first. */}
            {due.map(({ kind, rows }) =>
              rows.length > 0 ? (
                <Fragment key={kind}>
                  <div className={s.section}>{TERM_LABEL[kind]} ending</div>
                  {rows.map(r => {
                    const done = acknowledged(r, today)
                    const said = ackLine(r, today)
                    return (
                      <div key={r.id} className={s.row} data-unread={done ? undefined : 'true'}>
                        <span className={s.rowTag} data-tone={kind}>{kind === 'contract' ? 'CONT' : 'PROB'}</span>
                        <Link href={`/team/people/${r.id}`} className={s.rowText} onClick={() => setOpen(false)}>
                          <span className={s.rowTitle}>{r.name}</span>
                          <span className={s.rowMeta}>
                            {r.endsOn ? termEndLine(r.endsOn, today) : ''}
                            {r.department ? ` · ${r.department}` : ''}
                          </span>
                          {said ? <span className={s.rowMeta}>{said}</span> : null}
                        </Link>
                        {done ? (
                          <span className={s.chip} data-tone="ledger">Acknowledged</span>
                        ) : (
                          <button
                            type="button"
                            className={`${s.chip} ${s.chipButton}`}
                            data-tone="alert"
                            onClick={() => void acknowledgeReview(r)}
                            disabled={ackBusy !== null}
                            aria-busy={ackBusy === r.id || undefined}
                          >
                            {ackBusy === r.id ? 'Recording…' : 'Acknowledge'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </Fragment>
              ) : null,
            )}
            {anyDue ? (
              <>
                {ackError ? <div className={s.err} role="alert">{ackError}</div> : null}
                {memosOn ? <div className={s.section}>Memos</div> : null}
              </>
            ) : null}
            {shown.map(m => (
              <button key={m.id} type="button" className={s.row} data-unread={memoUnread(m) ? 'true' : undefined} onClick={() => openMemo(m)}>
                <span className={s.rowTag}>{m.kind === 'Memo' ? 'MEMO' : m.kind.toUpperCase().slice(0, 6)}</span>
                <span className={s.rowText}>
                  <span className={s.rowTitle}>{m.title}</span>
                  <span className={s.rowMeta}>
                    From {m.sender} · {memoDay(m.publishedAt)}{m.attachment ? ' · 1 file' : ''}
                  </span>
                </span>
                {memoWaiting(m) ? (
                  <span className={s.chip} data-tone="alert">Acknowledge</span>
                ) : m.acknowledgedAt ? (
                  <span className={s.chip} data-tone="ledger">Acknowledged</span>
                ) : null}
              </button>
            ))}
            {memosOn && memos !== null && shown.length === 0 ? <div className={s.empty}>No memos for you yet.</div> : null}
            {!memosOn && !reading && !anyDue ? (
              <div className={s.empty}>No probation or contract ends in the next {NOTICE_DAYS} days.</div>
            ) : null}
          </div>
        )}
      </Drawer>
    </>
  )
}
