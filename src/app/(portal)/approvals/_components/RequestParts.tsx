'use client'

import { drawerStyles as d } from '@/components/finv/Drawer'
import { DrawerGroup as Group, DrawerLine as Line } from '@/components/finv/DrawerParts'
import { HrIcon } from '@/components/hrv/icons'
import { plural, rm, type ApprovalRecordModel } from '@/lib/fin-app/approval-model'
import { sizeOf } from '@/app/(portal)/payments/_components/VoucherDetailBody'

// One request, drawn in the drawer's hand (2026-10-17 — moved out of the Finance phone app's Approvals, so the
// computer's Approvals drawer draws the same): the dark hero with its status, then what the desktop's request page
// shows — whom a voucher pays, from which bank and pool, its pools line by line, its files; a loan's terms; who sent
// it and when, and how it was decided; a terms change's lines as asked beside what they are now. On the phone the
// drawer's parts take the app's sizes (`[data-fin-app]`).

/** The hero's status: its word and its light. */
export function heroStatus(status: string, may: boolean): { text: string; light: string } {
  if (status === 'approved') return { text: 'Approved', light: 'ledger' }
  if (status === 'rejected') return { text: 'Rejected', light: 'danger' }
  if (status === 'partly') return { text: 'Partly approved', light: 'accent' }
  return may ? { text: 'Pending', light: 'wait' } : { text: 'Awaiting sign-off', light: 'alert' }
}

/** The drawer's dark hero, for a request or a combined one. */
export function ApprovalHero({ kicker, status, no, amount, to, note }: { kicker: string; status: { text: string; light: string }; no: string | null; amount: string; to: string; note: string }) {
  return (
    <div className={d.hero} data-light={status.light}>
      <div className={d.heroTop}>
        <span className={d.kicker}>{kicker}</span>
        <span className={d.heroChip}>
          <span className={d.heroDot} />
          {status.text}
        </span>
      </div>
      {no ? <div className={d.heroNo}>{no}</div> : null}
      <div className={d.heroAmount}>{amount}</div>
      <div className={d.heroTo}>{to}</div>
      <div className={d.heroNote}>
        <span className={d.heroNoteDot} />
        <span>{note}</span>
      </div>
    </div>
  )
}

/** A request as the desktop's request page lays it out, in the drawer's hand. */
export function RequestBody({ r, openFile }: { r: ApprovalRecordModel; openFile: (id: string) => void }) {
  const v = r.voucher
  const status = heroStatus(r.status, r.may)
  const note =
    r.status === 'pending'
      ? r.may
        ? r.groupId
          ? 'Decided with its combined request.'
          : 'Waiting for your decision.'
        : (r.why ?? 'Waiting for sign-off.')
      : `${r.status === 'approved' ? 'Approved' : 'Rejected'}${r.decidedAt ? ` · ${r.decidedAt}` : ''}`
  let n = 0
  const roman = () => `${['I', 'II', 'III', 'IV', 'V', 'VI'][n++]}.`
  return (
    <>
      <ApprovalHero
        kicker={r.typeLabel}
        status={status}
        no={r.no ?? (v ? 'Draft' : null)}
        amount={r.amount === null ? '—' : `${v?.credit ? '+' : ''}${rm(r.amount)}`}
        to={v ? `${v.credit ? 'Received from' : 'Pay to'} ${v.payee}` : r.loan ? `Loan to ${r.loan.borrower}` : r.title}
        note={note}
      />
      {v?.short && v.bank ? (
        <div className={d.error} role="alert">
          Insufficient bank balance — this voucher needs {rm(v.amount)} but {v.bank.name} holds only {rm(v.bank.balance)}. Top up or void this voucher before approving.
        </div>
      ) : null}

      {v ? (
        <>
          <Group n={roman()} title={v.credit ? 'Received from' : 'Pay to'}>
            <Line label={v.credit ? 'Payer' : 'Payee'} value={v.payee} sub={v.payeeCompany ?? undefined} />
            <Line label="Description" value={v.description || '—'} />
          </Group>
          <Group n={roman()} title="When & where">
            {v.bank ? <Line label={v.credit ? 'Into bank' : 'From bank'} value={v.bank.name} sub={`Acct ${v.bank.number} · Balance ${rm(v.bank.balance)}`} /> : null}
            <Line label={v.credit ? 'Credit to pool' : 'Deduct from pool'} value={v.pool ?? '—'} />
          </Group>
          {v.sources.length > 0 ? (
            <Group n={roman()} title={v.credit ? 'Credited to' : 'Deducted from'} foot={{ l: 'Total', v: rm(v.sources.reduce((t, x) => t + x.amount, 0)) }}>
              {v.sources.map((x, i) => (
                <Line key={i} label={x.pool} value={rm(x.amount)} sub={x.account ?? undefined} mono />
              ))}
            </Group>
          ) : null}
          <div className={d.label}>Attachments · {plural(v.files.length, 'file', 'files')}</div>
          {v.files.length > 0 ? (
            <div className={d.files}>
              {v.files.map((f) => (
                <button key={f.id} type="button" className={d.file} onClick={() => openFile(f.id)}>
                  <span className={d.fileIcon}>
                    <HrIcon name="doc" size={16} />
                  </span>
                  <span className={d.fileText}>
                    <span className={d.fileName}>{f.name}</span>
                    <span className={d.fileMeta}>{sizeOf(f.size)}</span>
                  </span>
                  <span className={d.fileChev} aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className={d.group}>
              <div className={d.groupEmpty}>No files attached.</div>
            </div>
          )}
        </>
      ) : null}

      {r.loan ? (
        <Group n={roman()} title="Loan">
          <Line label="Borrower" value={r.loan.borrower} />
          <Line label="Principal" value={rm(r.loan.principal)} mono />
          <Line label="Effective rate" value={r.loan.rate} sub={r.loan.rateSub} mono />
          <Line label="Monthly interest" value={rm(r.loan.monthlyInterest)} sub="At full principal" mono />
        </Group>
      ) : null}

      {/* A terms change: each line as asked from the month, what it is now beneath the ones it moves. */}
      {r.terms ? (
        <Group n={roman()} title={`Terms change · ${r.terms.scope}`}>
          {r.terms.rows.map((row) => (
            <Line key={row.label} label={row.label} value={row.asked} sub={row.changed ? `Now ${row.now}` : 'As it is'} />
          ))}
          {r.terms.rows.length === 0 ? <Line label="Asked" value={r.terms.words} sub={r.terms.why ?? undefined} /> : null}
          <Line label="Reason" value={r.terms.reason || '—'} />
        </Group>
      ) : null}

      <Group n={roman()} title="Request">
        {!v && !r.loan ? <Line label="Description" value={r.title} /> : null}
        <Line label="Type" value={r.typeLabel} />
        <Line label="Sent by" value={r.submittedBy} sub={r.submittedAt} />
        {r.decidedAt ? <Line label={r.status === 'approved' ? 'Approved' : 'Rejected'} value={r.decidedAt} mono /> : null}
        {r.notes && r.status !== 'pending' ? <Line label="Decision notes" value={r.notes} /> : null}
      </Group>
    </>
  )
}
