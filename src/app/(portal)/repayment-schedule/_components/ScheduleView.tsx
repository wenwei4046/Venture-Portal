'use client'

import { useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { SlidingTabs } from '@/components/motion/SlidingTabs'
import RepayCalendar, { type CalendarEvent } from './RepayCalendar'
import DueTable from './DueTable'
import { dueRows } from './due-rows'

export interface SchedRow {
  key: string
  counterparty: string
  detail: string
  principalDue: number
  interestDue: number
  totalDue: number
  /** This month's installment already collected/paid (principal repayment recorded this month). */
  done: boolean
  /** What came in (or went out) on the deal this month — every type, as the
   *  settled-this-month rows count it (2026-10-10, the handoff's Received column). */
  received?: number
  /** A repayment PV exists but is not yet approved (应付 only). */
  pending?: boolean
  /** Interest is computed with monthly compounding (利滚利). */
  compound?: boolean
  /** Funding-source remark parsed from repayment_terms (资金来源: …), 应收 only. */
  source?: string | null
}

export interface NoTermRow {
  key: string
  counterparty: string
  detail: string
  outstanding: number
  monthlyInterest: number
  /** What came in (or went out) on the deal this month. */
  received?: number
  /** Funding-source remark parsed from repayment_terms (资金来源: …), 应收 only. */
  source?: string | null
}

export interface CompoundRow {
  key: string
  counterparty: string
  detail: string
  /** Outstanding balance incl. capitalised interest (本金 + 已滚利息). */
  balance: number
  /** Interest rolled into the balance so far (累计已滚利息). */
  accrued: number
  /** Interest the balance accrues this month (本月利息). */
  thisMonthInterest: number
  /** What came in (or went out) on the deal this month. */
  received?: number
  /** Funding-source remark parsed from repayment_terms (资金来源: …), 应收 only. */
  source?: string | null
}

export interface CompoundTotals {
  balance: number
  accrued: number
  thisMonthInterest: number
}

/** 最低还息单 (2026-09-04): flagged loans / fund sources where the deal is
 *  "principal may wait, but each month's interest must be paid". */
export interface MinInterestRow {
  key: string
  counterparty: string
  detail: string
  /** This month's interest under the record's own convention. */
  due: number
  /** Interest-type repayments recorded in the month. */
  paid: number
  shortfall: number
  met: boolean
}

type Mode = 'all' | 'outstanding'
// 2026-10-09 (the Finance revamp, the user's Claude Design handoff): the
// month as a calendar, then one tab per side — what we collect (Fund OUT) and
// what we pay (Fund IN). 2026-10-10: each side is the handoff's one table,
// "Due to collect" / "Due to pay"; its four tables of before — scheduled,
// minimum interest, compounding, no fixed term, with the Full plan /
// Outstanding only toggle — fold away under it, for what that table does not
// show (the compounding balance, the outstanding of a deal with no term). The
// cards are the page's, one row per tab.
type Tab = 'cal' | 'collect' | 'pay'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export default function ScheduleView({
  monthLabel,
  month,
  linkMonth = null,
  today,
  events,
  cards,
  canRecord = false,
  canSetDefault = false,
  collectRows,
  collectMin,
  repayMin,
  collectNoTerm,
  collectNoTermOutstanding,
  collectNoTermInterest,
  collectCompound,
  collectCompoundTotals,
  repayRows,
  repayNoTerm,
  repayNoTermOutstanding,
  repayNoTermInterest,
  repayCompound,
  repayCompoundTotals,
}: {
  monthLabel: string
  /** YYYY-MM — the month on screen. */
  month: string
  /** The month as the page's URL names it (null: this month) — a deal's Back returns to it. */
  linkMonth?: string | null
  /** The office's today, YYYY-MM-DD. */
  today: string
  /** The month's installments, from each deal's repayment plan. */
  events: CalendarEvent[]
  /** The cards over the tabs: the calendar's, and each side's (the handoff). */
  cards?: Partial<Record<Tab, ReactNode>>
  /** Treasury · Create — a short row offers its deal's record form. */
  canRecord?: boolean
  canSetDefault?: boolean
  collectRows: SchedRow[]
  collectMin: MinInterestRow[]
  repayMin: MinInterestRow[]
  collectNoTerm: NoTermRow[]
  collectNoTermOutstanding: number
  collectNoTermInterest: number
  collectCompound: CompoundRow[]
  collectCompoundTotals: CompoundTotals
  repayRows: SchedRow[]
  repayNoTerm: NoTermRow[]
  repayNoTermOutstanding: number
  repayNoTermInterest: number
  repayCompound: CompoundRow[]
  repayCompoundTotals: CompoundTotals
}) {
  const [mode, setMode] = useState<Mode>('all')
  const [tab, setTab] = useState<Tab>('cal')

  const visible = (rows: SchedRow[]) => (mode === 'all' ? rows : rows.filter((r) => !r.done))
  const collectCount = collectRows.length + collectMin.length + collectCompound.length + collectNoTerm.length
  const payCount = repayRows.length + repayMin.length + repayCompound.length + repayNoTerm.length
  const first = dayjs(`${month}-01`)

  return (
    <div>
      {cards?.[tab] ?? null}

      <SlidingTabs
        items={[
          { key: 'cal', label: 'Calendar' },
          { key: 'collect', label: 'We collect', count: collectCount },
          { key: 'pay', label: 'We pay', count: payCount },
        ]}
        active={tab}
        onTabChange={(key) => setTab(key as Tab)}
        variant="control"
      />

      {tab === 'cal' ? (
        <RepayCalendar month={month} today={today} events={events} />
      ) : (
        <>
          <DueTable
            key={tab}
            side={tab}
            rows={
              tab === 'collect'
                ? dueRows({ rows: collectRows, min: collectMin, compound: collectCompound, noTerm: collectNoTerm })
                : dueRows({ rows: repayRows, min: repayMin, compound: repayCompound, noTerm: repayNoTerm })
            }
            monthLong={first.format('MMMM YYYY')}
            monthShort={first.format('MMM')}
            linkMonth={linkMonth}
            canRecord={canRecord}
            canSetDefault={canSetDefault}
          />

          <details className="fin-fold">
            <summary>
              Full plans
              <small>MINIMUM INTEREST · SCHEDULED · COMPOUNDING · NO FIXED TERM</small>
            </summary>
            <div className="fin-fold-inner">
              {/* Toggle — only affects the scheduled tables */}
              <div className="flex flex-wrap items-center gap-2 mb-6" role="group" aria-label="View">
                <button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')} className={mode === 'all' ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
                  Full plan (incl. {tab === 'collect' ? 'collected' : 'paid'})
                </button>
                <button type="button" aria-pressed={mode === 'outstanding'} onClick={() => setMode('outstanding')} className={mode === 'outstanding' ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
                  Outstanding only
                </button>
              </div>
    
              {tab === 'collect' ? (
                <>
                  {collectMin.length > 0 ? (
                    <MinInterestSection title="Minimum interest — to collect" rows={collectMin} paidLabel="Received" monthLabel={monthLabel} />
                  ) : null}
                  <ScheduleSection title="To collect — scheduled loans" rows={visible(collectRows)} tone="credit" monthLabel={monthLabel} />
                  <CompoundSection
                    title="To collect — compounding"
                    note="Principal on these loans is not being collected yet — each month's interest rolls into the balance and compounds. Not counted in the cash to collect. Rolled interest = total interest capitalised so far."
                    rows={collectCompound}
                    totals={collectCompoundTotals}
                    tone="credit"
                  />
                  <NoTermSection
                    title="To collect — no fixed term"
                    note="Loans with no agreed rate / tenure / method — excluded from this month's collections. Outstanding principal and monthly interest listed for reference."
                    rows={collectNoTerm}
                    outstanding={collectNoTermOutstanding}
                    interest={collectNoTermInterest}
                  />
                </>
              ) : (
                <>
                  {repayMin.length > 0 ? (
                    <MinInterestSection title="Minimum interest — to repay" rows={repayMin} paidLabel="Paid" monthLabel={monthLabel} />
                  ) : null}
                  <ScheduleSection title="To repay — scheduled fund sources" rows={visible(repayRows)} tone="debit" monthLabel={monthLabel} />
                  <CompoundSection
                    title="To repay — compounding"
                    note="Principal on these fund sources is not being repaid yet — monthly interest rolls into the balance. Not counted in the cash to repay."
                    rows={repayCompound}
                    totals={repayCompoundTotals}
                    tone="debit"
                  />
                  <NoTermSection
                    title="To repay — no fixed term"
                    note="Fund sources with no agreed tenure and no pending repayment PV — excluded from this month's repayments. To schedule one, edit it in Fund In and set the tenure."
                    rows={repayNoTerm}
                    outstanding={repayNoTermOutstanding}
                    interest={repayNoTermInterest}
                  />
                </>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  )
}

/** A word on a row, as the sheet's chips (Inter, 2026-10-10 — was a mono tag). */
function Tag({ tone, title, children }: { tone: string; title?: string; children: ReactNode }) {
  return (
    <span className={`chip ${tone} ml-2`} title={title}>
      {children}
    </span>
  )
}

/** Funding-source chip — the Fund OUT list's SC badge. */
function SourceChip({ source }: { source?: string | null }) {
  if (!source) return null
  return (
    <Tag tone="info" title={`Source of capital: ${source}`}>
      SC {source}
    </Tag>
  )
}

/** 最低还息单 — deals where principal may wait but the month's interest must be
 *  paid. Tracking only: these figures are NOT added to the hero cash totals. */
function MinInterestSection({
  title,
  rows,
  paidLabel,
  monthLabel,
}: {
  title: string
  rows: MinInterestRow[]
  paidLabel: 'Received' | 'Paid'
  monthLabel: string
}) {
  if (rows.length === 0) return null
  const due = rows.reduce((s, r) => r2(s + r.due), 0)
  const paid = rows.reduce((s, r) => r2(s + r.paid), 0)
  const short = rows.reduce((s, r) => r2(s + r.shortfall), 0)
  return (
    <section className="mb-12 max-w-4xl">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${short > 0 ? 'text-danger' : 'text-ledger'}`}>
          {short > 0 ? `short ${formatMoney(short)}` : 'all met ✓'}
        </span>
      </div>
      <p className="font-serif italic text-muted text-xs mb-3">
        Minimum interest — principal can be repaid gradually, but each month&rsquo;s interest must be {paidLabel === 'Received' ? 'received' : 'paid'} in
        full. Not counted in the cash totals above.
      </p>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Counterparty</th>
            <th className="num">Min interest</th>
            <th className="num">{paidLabel} · {monthLabel}</th>
            <th className="num">Short</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <div className="font-serif text-md text-ink">
                  {r.counterparty}
                  {r.met ? <Tag tone="ledger">met</Tag> : <Tag tone="danger">short</Tag>}
                </div>
                <div className="font-mono text-xs text-muted">{r.detail}</div>
              </td>
              <td className="num">{formatMoney(r.due)}</td>
              <td className="num">{formatMoney(r.paid)}</td>
              <td className={`num font-medium ${r.met ? 'text-ledger' : 'text-danger'}`}>
                {r.met ? '—' : formatMoney(r.shortfall)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-hairline">
            <td className="font-serif italic text-ink font-medium">Subtotal</td>
            <td className="num font-semibold">{formatMoney(due)}</td>
            <td className="num font-semibold">{formatMoney(paid)}</td>
            <td className={`num font-semibold ${short > 0 ? 'text-danger' : 'text-ledger'}`}>
              {short > 0 ? formatMoney(short) : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

function ScheduleSection({ title, rows, tone, monthLabel }: { title: string; rows: SchedRow[]; tone: 'credit' | 'debit'; monthLabel: string }) {
  const principal = rows.reduce((s, r) => r2(s + r.principalDue), 0)
  const interest = rows.reduce((s, r) => r2(s + r.interestDue), 0)
  const total = rows.reduce((s, r) => r2(s + r.totalDue), 0)
  return (
    <section className="mb-12 max-w-4xl">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${tone === 'credit' ? 'text-ledger' : 'text-danger'}`}>{formatMoney(total)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">Nothing due in {monthLabel}.</p>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Counterparty</th>
              <th className="num">Principal</th>
              <th className="num">Interest</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <div className="font-serif text-md text-ink">
                    {r.counterparty}
                    <SourceChip source={r.source} />
                    {r.compound ? <Tag tone="info">compound</Tag> : null}
                    {r.done ? <Tag tone="ledger">paid in {monthLabel}</Tag> : null}
                    {r.pending ? <Tag tone="wait">pending PV</Tag> : null}
                  </div>
                  <div className="font-mono text-xs text-muted">{r.detail}</div>
                </td>
                <td className="num">{formatMoney(r.principalDue)}</td>
                <td className="num">{formatMoney(r.interestDue)}</td>
                <td className="num font-medium">{formatMoney(r.totalDue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-hairline">
              <td className="font-serif italic text-ink font-medium">Subtotal</td>
              <td className="num font-semibold">{formatMoney(principal)}</td>
              <td className="num font-semibold">{formatMoney(interest)}</td>
              <td className={`num font-semibold ${tone === 'credit' ? 'text-ledger' : 'text-danger'}`}>{formatMoney(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}

function CompoundSection({
  title,
  note,
  rows,
  totals,
  tone,
}: {
  title: string
  note: string
  rows: CompoundRow[]
  totals: CompoundTotals
  tone: 'credit' | 'debit'
}) {
  if (rows.length === 0) return null
  return (
    <section className="mb-12 max-w-4xl">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className="count text-info">{formatMoney(totals.balance)}</span>
      </div>
      <p className="font-serif italic text-muted text-xs mb-3">{note}</p>
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Counterparty</th>
            <th className="num">Balance</th>
            <th className="num">Rolled interest</th>
            <th className="num">This month</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <div className="font-serif text-md text-ink">
                  {r.counterparty}
                  <SourceChip source={r.source} />
                  <Tag tone="info">compound</Tag>
                </div>
                <div className="font-mono text-xs text-muted">{r.detail}</div>
              </td>
              <td className="num font-medium">{formatMoney(r.balance)}</td>
              <td className="num text-info">{formatMoney(r.accrued)}</td>
              <td className="num">{formatMoney(r.thisMonthInterest)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-hairline">
            <td className="font-serif italic text-ink font-medium">Subtotal</td>
            <td className={`num font-semibold ${tone === 'credit' ? 'text-ledger' : 'text-danger'}`}>{formatMoney(totals.balance)}</td>
            <td className="num font-semibold text-info">{formatMoney(totals.accrued)}</td>
            <td className="num font-semibold">{formatMoney(totals.thisMonthInterest)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}

function NoTermSection({
  title,
  note,
  rows,
  outstanding,
  interest,
}: {
  title: string
  note: string
  rows: NoTermRow[]
  outstanding: number
  interest: number
}) {
  return (
    <section className="mb-12 max-w-4xl">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className="count">{formatMoney(outstanding)}</span>
      </div>
      <p className="font-serif italic text-muted text-xs mb-3">{note}</p>
      {rows.length === 0 ? (
        <p className="font-serif italic text-muted text-sm">None.</p>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Counterparty</th>
              <th className="num">Outstanding</th>
              <th className="num">Monthly interest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <div className="font-serif text-md text-ink">
                    {r.counterparty}
                    <SourceChip source={r.source} />
                  </div>
                  <div className="font-mono text-xs text-muted">{r.detail}</div>
                </td>
                <td className="num">{formatMoney(r.outstanding)}</td>
                <td className="num">{formatMoney(r.monthlyInterest)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-hairline">
              <td className="font-serif italic text-ink font-medium">Subtotal</td>
              <td className="num font-semibold">{formatMoney(outstanding)}</td>
              <td className="num font-semibold">{formatMoney(interest)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}
