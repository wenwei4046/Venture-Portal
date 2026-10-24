'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DialogMenu, FinDialog } from '@/components/finv/Dialog'
import { FullCard as Card, FullFact as Fact, FullPanelRow as PanelRow, FullRow as Row, FullTrail, fullStyles as s, type FullStep } from '@/components/finv/FullParts'
import { plural, recordLinks, rm, type ApprovalRecordModel } from '@/lib/fin-app/approval-model'
import AttachmentList, { type AttachmentListItem } from '@/components/voucher/AttachmentList'
import { useApprovalDecisions } from '../../_components/decisions'
import { heroStatus } from '../../_components/RequestParts'
import a from '../../_components/approvals.module.css'

// A request's full page (2026-10-17 — the Principal's own view takes Finance's view, and Approvals is the tab the
// user opens most): drawn as Finance's records are (D06 — a voucher's, a loan's, a fund source's full page): "←
// Approvals" and the crumb; the number (or the kind), its status and four facts; the numbered cards — whom a voucher
// pays, its pools line by line, its files; a loan's terms; anything else's own words; the decision's notes; the trail —
// beside the dark panel with the money, the bank and pool, and the steps: Approve · Reject (the drawer's and the
// phone's own decisions, `decisions.tsx`) and ⋯ for the pages it leads to. What it reads is the drawer's record
// (`approvalRecordModel`), so the three can never disagree.

/** The status's chip tone on the page (the pill), from the hero's light. */
const PILL: Record<string, string> = { wait: 'wait', alert: 'alert', ledger: 'ledger', danger: 'danger', accent: 'accent' }

export default function ApprovalFullPage({
  r,
  attachments,
  back,
}: {
  r: ApprovalRecordModel
  /** The voucher's files as the request page always listed them (type, size, when) — for their previews. */
  attachments: AttachmentListItem[]
  back: { href: string; label: string }
}) {
  const v = r.voucher
  const status = heroStatus(r.status, r.may)
  const amount = r.amount === null ? '—' : `${v?.credit ? '+' : ''}${rm(r.amount)}`
  const to = v ? v.payee : r.loan ? r.loan.borrower : null
  const decision: FullStep =
    r.status === 'pending'
      ? { label: 'Decision', by: r.groupId ? 'With its combined request' : r.may ? 'Waiting for your decision' : (r.why ?? 'Waiting for sign-off'), when: null, state: 'todo' }
      : { label: r.status === 'approved' ? 'Approved' : 'Rejected', by: null, when: r.decidedAt, state: r.status === 'approved' ? 'done' : 'bad' }
  let n = 0

  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.crumbRow}>
        <Link href={back.href} className={s.back}>
          ← {back.label}
        </Link>
        <span className={s.crumb}>Daily · Approvals · {r.no ?? r.typeLabel}</span>
      </div>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.kicker}>{r.no ? r.typeLabel : 'Approval request'}</div>
          <div className={s.numberRow}>
            <h1 className={s.number}>{r.no ?? r.typeLabel}</h1>
            <span className={s.pill} data-tone={PILL[status.light] ?? 'def'}>
              <span className={s.pillDot} />
              {status.text}
            </span>
          </div>
          <div className={s.facts}>
            <Fact label="Amount" value={amount} mono />
            {to ? <Fact label={v?.credit ? 'From' : 'To'} value={to} /> : null}
            <Fact label="Submitted" value={r.submittedAt} />
            <Fact label="By" value={r.submittedBy} />
          </div>
        </div>
      </div>

      <div className={s.body}>
        <div className={s.cards}>
          {v ? (
            <>
              <Card n={++n} title={v.credit ? 'Received from' : 'Pay to'}>
                <div className={s.lead}>{v.payee}</div>
                <dl className={s.dl}>
                  {v.payeeCompany ? <Row label="Company" value={v.payeeCompany} /> : null}
                  <Row label="Description" value={v.description || '—'} />
                  {v.upstream ? (
                    <Row
                      label="Raised by"
                      value={
                        <Link href={v.upstream.portalHref} className={a.inline}>
                          {v.upstream.label} ↗
                        </Link>
                      }
                    />
                  ) : null}
                </dl>
              </Card>

              {v.sources.length > 0 ? (
                <Card n={++n} title={v.credit ? 'Credited to' : 'Deducted from'} aside={plural(v.sources.length, 'line', 'lines')}>
                  <div className={s.table}>
                    <div className={s.tHead}>
                      <span className={s.tCol}>Pool</span>
                      <span className={s.tCol}>Account</span>
                      <span className={s.tNum}>Amount</span>
                    </div>
                    {v.sources.map((x, i) => (
                      <div key={i} className={s.tRow}>
                        <span className={s.tCol}>{x.pool}</span>
                        <span className={s.tCol} data-sub="true">
                          {x.account ?? '—'}
                        </span>
                        <span className={s.tNum}>{rm(x.amount)}</span>
                      </div>
                    ))}
                    <div className={s.tFoot}>
                      <span className={s.tCol}>Total</span>
                      <span className={s.tNum}>{rm(v.sources.reduce((t, x) => t + x.amount, 0))}</span>
                    </div>
                  </div>
                </Card>
              ) : null}

              <Card n={++n} title="Attachments" aside={plural(v.files.length, 'FILE', 'FILES')}>
                {/* The request page's own list, as before: each file to open, a picture or a PDF shown in place —
                    the bill read without leaving the page. Reading only; Remove is the voucher's page's. */}
                <AttachmentList attachments={attachments} emptyMessage="No attachments uploaded yet. Ask Finance to attach supporting docs before approving." />
              </Card>
            </>
          ) : null}

          {r.loan ? (
            <Card n={++n} title="Loan">
              <div className={s.lead}>{r.loan.borrower}</div>
              <dl className={s.dl}>
                <Row label="Principal" value={rm(r.loan.principal)} />
                <Row label="Effective rate" value={r.loan.rate} sub={r.loan.rateSub} />
                <Row label="Monthly interest" value={rm(r.loan.monthlyInterest)} sub="At full principal" />
              </dl>
            </Card>
          ) : null}

          {r.terms ? (
            <Card n={++n} title="Terms change" aside={`FROM ${r.terms.fromLabel.toUpperCase()}`}>
              {/* The month asked, its terms now beside the terms asked (lib/terms-change-request) — what Approve applies. */}
              {r.terms.rows.length > 0 ? <TermsTable rows={r.terms.rows} fromLabel={r.terms.fromLabel} /> : null}
              {r.terms.why ? <p className={a.termsWhy}>{r.terms.why}</p> : null}
              <dl className={s.dl} style={{ marginTop: 14 }}>
                {r.terms.rows.length === 0 ? <Row label="Asked" value={r.terms.words} /> : null}
                <Row label="Reason" value={r.terms.reason || '—'} />
              </dl>
            </Card>
          ) : null}

          {!v && !r.loan ? (
            <Card n={++n} title="Request">
              <div className={s.lead}>{r.title}</div>
              <dl className={s.dl}>
                <Row label="Type" value={r.typeLabel} />
              </dl>
            </Card>
          ) : null}

          {r.status !== 'pending' && r.notes ? (
            <Card n={++n} title="Decision notes">
              <p className={a.notes}>{r.notes}</p>
            </Card>
          ) : null}

          <Card n={++n} title="Trail" aside={`${r.status === 'pending' ? 1 : 2} / 2 steps`}>
            <FullTrail steps={[{ label: 'Submitted', by: r.submittedBy, when: r.submittedAt, state: 'done' }, decision]} />
          </Card>
        </div>

        <aside className={s.panel} data-light={PILL[status.light] ?? 'def'}>
          <div className={s.pTop}>
            <span className={s.pLabel}>{r.typeLabel}</span>
            <span className={s.pChip}>
              <span className={s.pChipDot} />
              {status.text}
            </span>
          </div>
          <div className={s.pAmount}>{amount}</div>
          <p className={s.pTo}>{v ? `${v.credit ? 'Received from' : 'Pay to'} ${v.payee}` : r.loan ? `Loan to ${r.loan.borrower}` : r.title}</p>

          {v ? (
            <>
              <div className={s.pGroup}>When &amp; where</div>
              {v.bank ? <PanelRow label={v.credit ? 'Into bank' : 'From bank'} value={v.bank.name} sub={`${v.bank.number} · Balance ${rm(v.bank.balance)}`} /> : null}
              <PanelRow label={v.credit ? 'Credit to pool' : 'Deduct from pool'} value={v.pool ?? '—'} />
            </>
          ) : null}
          {r.loan ? (
            <>
              <div className={s.pGroup}>Terms</div>
              <PanelRow label="Rate" value={r.loan.rate} sub={r.loan.rateSub} mono />
              <PanelRow label="Monthly interest" value={rm(r.loan.monthlyInterest)} mono />
            </>
          ) : null}

          {v?.short && v.bank ? (
            <p className={s.pError} role="alert">
              Insufficient bank balance — this voucher needs {rm(v.amount)} but {v.bank.name} holds only {rm(v.bank.balance)}. Top up or void this voucher before approving.
            </p>
          ) : null}

          <PanelSteps r={r} back={back.href} />
        </aside>
      </div>
    </div>
  )
}

/** A terms change's lines: now, and as asked from the month — the ones it moves picked out. */
export function TermsTable({ rows, fromLabel }: { rows: NonNullable<ApprovalRecordModel['terms']>['rows']; fromLabel: string }) {
  return (
    <div className={a.terms}>
      <span className={a.termsHead} />
      <span className={a.termsHead}>Now</span>
      <span className={a.termsHead}>Asked · from {fromLabel}</span>
      {rows.map((row) => (
        <TermsLine key={row.label} row={row} />
      ))}
    </div>
  )
}

function TermsLine({ row }: { row: NonNullable<ApprovalRecordModel['terms']>['rows'][number] }) {
  return (
    <>
      <span className={a.termsLabel}>{row.label}</span>
      <span className={a.termsNow}>{row.now}</span>
      <span className={a.termsAsked} data-changed={row.changed ? 'true' : undefined}>
        {row.asked}
      </span>
    </>
  )
}

/** The panel's steps: Approve · Reject while it is the reader's to decide, the combined request it rides with, ⋯ for the pages it leads to. */
function PanelSteps({ r, back }: { r: ApprovalRecordModel; back: string }) {
  const router = useRouter()
  const [menu, setMenu] = useState(false)
  // Decided, the request leaves the queue: back to it, the toast saying so (the old page's redirect).
  const decisions = useApprovalDecisions({ onDecided: () => router.push(back) })
  const links = recordLinks(r)
  const pending = r.status === 'pending'
  const decides = pending && r.may && !r.groupId
  const short = !!r.voucher?.short

  return (
    <>
      {pending && !r.may ? <p className={a.panelNote}>{r.why ?? 'Waiting for sign-off.'}</p> : null}
      <div className={s.pBar}>
        {pending && r.groupId ? (
          <Link href={`/approvals?group_id=${encodeURIComponent(r.groupId)}`} className={s.pBtn} data-kind="primary">
            Open the combined request
          </Link>
        ) : null}
        {decides ? (
          <>
            <button
              type="button"
              className={s.pBtn}
              data-kind="primary"
              disabled={decisions.busy || short}
              title={short ? 'The bank balance is below the voucher amount' : undefined}
              onClick={() => decisions.ask({ kind: 'approve', scope: 'one', record: r })}
            >
              Approve
            </button>
            <button type="button" className={s.pBtn} data-kind="danger" disabled={decisions.busy} onClick={() => decisions.ask({ kind: 'reject', scope: 'one', record: r })}>
              Reject
            </button>
          </>
        ) : null}
        {links.length > 0 ? (
          <button type="button" className={s.pBtn} data-kind="more" aria-label="More" onClick={() => setMenu(true)}>
            ⋯
          </button>
        ) : null}
      </div>
      <FinDialog open={menu} onClose={() => setMenu(false)} title={r.no ?? r.typeLabel}>
        <DialogMenu
          items={links.map((l) => ({
            key: l.key,
            label: l.label,
            onClick: () => {
              setMenu(false)
              router.push(l.href)
            },
          }))}
        />
      </FinDialog>
      {decisions.dialog}
    </>
  )
}
