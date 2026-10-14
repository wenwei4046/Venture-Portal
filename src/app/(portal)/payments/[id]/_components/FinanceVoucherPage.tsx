import Link from 'next/link'
import type { ReactNode } from 'react'
import { officeTime } from '@/lib/office-time'
import AmendDateButton from '../../_components/AmendDateButton'
import type { VoucherDetail } from '../../_lib/voucher-detail'
import type { VoucherPageExtras } from '../../_lib/voucher-page'
import ReassignGlAccountButton from './ReassignGlAccountButton'
import FullPageSteps from './FullPageSteps'
import FullPageFiles from './FullPageFiles'
import CopyAsDraft from './CopyAsDraft'
import s from '@/components/finv/full.module.css'

// A payment voucher's full page (2026-10-14, the Finance revamp v2 — D06 of
// `.design/fin-r2/handoff`): "← Payments" and the crumb; the number, its
// status and four facts, Print and Copy; then the numbered cards — Pay to,
// Deducted from, whom a salary voucher pays, the files, the trail across, the
// audit log — beside the sticky dark panel with when, where, the booking and
// the steps this reader may take. Treasury's readers; a receipt keeps its page
// (the README: not redesigned), HR keeps its own.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fd = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MON[m - 1]} ${y}`
}
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const stamp = (iso: string) => officeTime(iso).format('DD MMM YYYY · HH:mm')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const STATUS_WORDS: Record<string, string> = { draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved', paid: 'Paid', voided: 'Voided' }
const PILL: Record<string, string> = { draft: 'def', pending_approval: 'wait', approved: 'accent', paid: 'ledger', voided: 'danger' }

export default function FinanceVoucherPage({ detail: v, extras, canCopy }: { detail: VoucherDetail; extras: VoucherPageExtras; canCopy: boolean }) {
  const st = v.status
  const no = v.no ?? 'Draft'
  let n = 0
  const done = v.trail.filter((t) => t.state !== 'todo').length
  const isPayroll = v.reference === 'payroll_disbursement' || v.reference === 'payroll_statutory' || v.reference === 'payroll_payment_request'

  return (
    <div className={s.root} data-fin-kit="">
      <div className={s.crumbRow}>
        <Link href="/payments" className={s.back}>
          ← Payments
        </Link>
        <span className={s.crumb}>Daily · Payments · {no}</span>
      </div>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.kicker}>
            Payment voucher{v.account ? ` · ${v.account}` : ''}
          </div>
          <div className={s.numberRow}>
            <h1 className={s.number}>{no}</h1>
            <span className={s.pill} data-tone={PILL[st] ?? 'def'}>
              <span className={s.pillDot} />
              {STATUS_WORDS[st] ?? st}
            </span>
          </div>
          <div className={s.facts}>
            <Fact label="Amount" value={rm(v.amount)} mono />
            <Fact label="To" value={v.payee} />
            <Fact label="Payment date" value={fd(v.paymentDate)} mono />
            <Fact label="Created by" value={`${v.createdBy ?? 'Unknown'} · ${stamp(v.createdAt)}`} />
          </div>
        </div>
        <div className={s.topActs}>
          <a href={`/payments/voucher-doc?id=${v.id}`} target="_blank" rel="noopener noreferrer" className={s.topBtn}>
            Print
          </a>
          {canCopy ? <CopyAsDraft voucherId={v.id} voucherNo={v.no} /> : null}
        </div>
      </div>

      <div className={s.body}>
        <div className={s.cards}>
          <Card n={++n} title="Pay to">
            <div className={s.lead}>{v.payee}</div>
            <dl className={s.dl}>
              {v.payeeCompany ? <Row label="Company" value={v.payeeCompany} /> : null}
              <Row label="Description" value={v.description || '—'} />
              {v.method ? <Row label="Method" value={v.method} /> : null}
              {v.notes ? <Row label="Notes" value={v.notes} /> : null}
            </dl>
          </Card>

          {v.sources.length > 0 ? (
            <Card
              n={++n}
              title="Deducted from"
              aside={plural(v.sources.length, 'line', 'lines')}
              extra={extras.reassign ? <ReassignGlAccountButton voucherId={v.id} fromOptions={extras.reassign.from} accountOptions={extras.reassign.options} /> : null}
            >
              <div className={s.table}>
                <div className={s.tHead}>
                  <span className={s.tCol}>Pool / Item</span>
                  <span className={s.tCol}>Account</span>
                  <span className={s.tNum}>Amount</span>
                </div>
                {v.sources.map((r, i) => (
                  <div key={i} className={s.tRow}>
                    <span className={s.tCol}>{r.pool}</span>
                    <span className={s.tCol} data-sub="true">
                      {r.account}
                    </span>
                    <span className={s.tNum}>{rm(r.amount)}</span>
                  </div>
                ))}
                <div className={s.tFoot}>
                  <span className={s.tCol}>Total</span>
                  <span className={s.tNum}>{rm(v.sources.reduce((t, r) => t + r.amount, 0))}</span>
                </div>
              </div>
            </Card>
          ) : null}

          {extras.people.length > 0 ? (
            <Card n={++n} title="People on this voucher" aside={`${plural(extras.peopleCount, 'person', 'people')} · ${plural(extras.people.length, 'payment', 'payments')}`}>
              <div className={s.table}>
                <div className={s.tHead}>
                  <span className={`${s.tCol} ${s.tWide}`}>Employee</span>
                  <span className={s.tCol}>Payment</span>
                  <span className={s.tCol}>Receiving account</span>
                  <span className={s.tNum}>Amount</span>
                </div>
                {extras.people.map((p, i) => (
                  <div key={i} className={s.tRow}>
                    <span className={`${s.tCol} ${s.tWide}`} title={[p.name, p.code, p.department].filter(Boolean).join(' · ')}>
                      {p.name}
                    </span>
                    <span className={s.tCol} data-sub="true">
                      {p.payment}
                    </span>
                    <span className={s.tCol} data-sub="true" title={p.account ? [p.account.label, p.account.bank, p.account.number].filter(Boolean).join(' · ') : undefined}>
                      {p.account ? `${p.account.bank} · ${p.account.number}` : 'Not recorded'}
                    </span>
                    <span className={s.tNum}>{rm(p.amount)}</span>
                  </div>
                ))}
                {extras.people.length > 1 ? (
                  <div className={s.tFoot}>
                    <span className={s.tCol}>Total</span>
                    <span className={s.tNum}>{rm(extras.people.reduce((t, p) => t + p.amount, 0))}</span>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {extras.statutory.length > 0 ? (
            <Card n={++n} title="Statutory contributions" aside={`${plural(extras.statutoryPeople, 'person', 'people')} · ${extras.statutoryPeriods}`}>
              <div className={s.table}>
                <div className={s.tHead}>
                  <span className={`${s.tCol} ${s.tWide}`}>Employee</span>
                  <span className={s.tCol}>Department</span>
                  <span className={s.tCol}>Scheme</span>
                  <span className={s.tNum}>Contribution</span>
                </div>
                {extras.statutory.map((r, i) => (
                  <div key={i} className={s.tRow}>
                    <span className={`${s.tCol} ${s.tWide}`}>{r.name}</span>
                    <span className={s.tCol} data-sub="true">
                      {r.department}
                    </span>
                    <span className={s.tCol} data-sub="true">
                      {r.scheme}
                    </span>
                    <span className={s.tNum}>{rm(r.amount)}</span>
                  </div>
                ))}
                <div className={s.tFoot}>
                  <span className={s.tCol}>Total contribution</span>
                  <span className={s.tNum}>{rm(extras.statutory.reduce((t, r) => t + r.amount, 0))}</span>
                </div>
              </div>
            </Card>
          ) : null}

          <Card n={++n} title="Attachments" aside={plural(v.files.length, 'FILE', 'FILES')}>
            <FullPageFiles voucherId={v.id} files={v.files} open={v.filesOpen} takes={v.takesFiles} canEdit={v.can.edit} />
          </Card>

          <Card n={++n} title="Trail" aside={`${done} / ${v.trail.length} steps`}>
            <div className={s.trail}>
              {v.trail.map((t, i) => (
                <div key={i} className={s.step} data-state={t.state}>
                  <div className={s.stepRail}>
                    <span className={s.stepDot} />
                    <span className={s.stepLine} data-on={v.trail[i + 1] && v.trail[i + 1].state !== 'todo' ? 'true' : undefined} />
                  </div>
                  <span className={s.stepLabel}>{t.label}</span>
                  <span className={s.stepBy}>
                    {t.by ?? (t.state === 'todo' ? '' : '—')}
                    <br />
                    {t.at ? stamp(t.at) : (t.note ?? '')}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card n={++n} title="Audit log" aside={plural(extras.audit.length, 'EVENT', 'EVENTS')}>
            {extras.audit.length === 0 ? (
              <p className={s.none}>No change on record.</p>
            ) : (
              <div className={s.table}>
                <div className={s.tHead}>
                  <span className={s.aWhen}>When</span>
                  <span className={s.aWho}>Who</span>
                  <span className={s.aWhat}>What changed</span>
                </div>
                {extras.audit.map((a, i) => (
                  <div key={i} className={s.aRow}>
                    <span className={s.aWhen}>{a.at}</span>
                    <span className={s.aWho} title={a.who}>
                      {a.who}
                    </span>
                    <span className={s.aWhat}>{a.what}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className={s.panel} data-light={PILL[st] === 'def' ? 'def' : PILL[st] ?? 'def'}>
          <div className={s.pTop}>
            <span className={s.pLabel}>Payment voucher</span>
            <span className={s.pChip}>
              <span className={s.pChipDot} />
              {STATUS_WORDS[st] ?? st}
            </span>
          </div>
          <div className={s.pAmount}>{rm(v.amount)}</div>
          <p className={s.pTo}>Pay to {v.payee}</p>

          <div className={s.pGroup}>When &amp; where</div>
          <PanelRow
            label="Payment date"
            value={fd(v.paymentDate)}
            mono
            after={
              st === 'paid' && v.paymentDate && v.can.edit && !isPayroll ? (
                <AmendDateButton kind="voucher" id={v.id} currentDate={v.paymentDate} label={no} triggerClassName={s.pLink} />
              ) : null
            }
          />
          {v.bank ? <PanelRow label="From bank" value={v.bank.name} sub={v.bank.number} /> : null}

          <div className={s.pGroup}>Booking</div>
          <PanelRow label="Account" value={v.account ?? '—'} sub={v.accountCodes} />
          <PanelRow label="Pool" value={v.pool ?? '—'} />
          {v.settledInvoices.length > 0 ? (
            <PanelRow label="Settles invoice" value={v.settledInvoices.length === 1 ? v.settledInvoices[0] : `${v.settledInvoices[0]} + ${v.settledInvoices.length - 1} more`} mono />
          ) : null}

          <FullPageSteps detail={v} />
        </aside>
      </div>
    </div>
  )
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className={s.fact}>
      <span className={s.factLabel}>{label}</span>
      <span className={s.factValue} data-mono={mono ? 'true' : undefined}>
        {value}
      </span>
    </span>
  )
}

function Card({ n, title, aside, extra, children }: { n: number; title: string; aside?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.card} aria-label={title}>
      <div className={s.cardHead}>
        <span className={s.cardN}>{n}</span>
        <span className={s.cardTitle}>{title}</span>
        <span className={s.grow} />
        {extra}
        {aside ? <span className={s.cardAside}>{aside}</span> : null}
      </div>
      <div className={s.cardBody}>{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={s.dt}>{label}</dt>
      <dd className={s.dd}>{value}</dd>
    </>
  )
}

function PanelRow({ label, value, sub, mono = false, after }: { label: string; value: string; sub?: string | null; mono?: boolean; after?: ReactNode }) {
  return (
    <div className={s.pRow}>
      <span className={s.pRowLabel}>{label}</span>
      <span className={s.pRowValue}>
        <span className={s.pRowV} data-mono={mono ? 'true' : undefined}>
          {value}
        </span>
        {sub ? <span className={s.pRowSub}>{sub}</span> : null}
        {after}
      </span>
    </div>
  )
}
