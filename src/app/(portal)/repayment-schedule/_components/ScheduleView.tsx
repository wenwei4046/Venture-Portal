'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/utils'

export interface SchedRow {
  key: string
  counterparty: string
  detail: string
  principalDue: number
  interestDue: number
  totalDue: number
  /** This month's installment already collected/paid (principal repayment recorded this month). */
  done: boolean
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
  /** Funding-source remark parsed from repayment_terms (资金来源: …), 应收 only. */
  source?: string | null
}

export interface CompoundTotals {
  balance: number
  accrued: number
  thisMonthInterest: number
}

type Mode = 'all' | 'outstanding'
// 'scheduled' = the cash actually due this month (feeds the hero totals);
// 'reference' = compounding 挂账 + no-fixed-term items, which are excluded
// from the totals — split into their own tab so the main view stays short.
type Tab = 'scheduled' | 'reference'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export default function ScheduleView({
  monthLabel,
  collectRows,
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
  collectRows: SchedRow[]
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
  const [tab, setTab] = useState<Tab>('scheduled')

  const visible = (rows: SchedRow[]) => (mode === 'all' ? rows : rows.filter((r) => !r.done))
  const sum = (rows: SchedRow[]) => rows.reduce((s, r) => r2(s + r.totalDue), 0)

  const collectVisible = visible(collectRows)
  const repayVisible = visible(repayRows)
  const collectTot = sum(collectVisible)
  const repayTot = sum(repayVisible)
  const net = r2(collectTot - repayTot)

  const referenceCount =
    collectCompound.length + collectNoTerm.length + repayCompound.length + repayNoTerm.length

  return (
    <div>
      {/* Hero totals (reflect the active view). Full-width grid like the
          /payments hero — a max-w-3xl cap squeezed each column below the
          rendered width of "RM (277,423.46)" at text-3xl, so the unbreakable
          number token overflowed and overlapped the neighbouring column.
          lg breakpoint (not sm): below ~1024px the figures stack instead. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">To collect · {monthLabel}</div>
          <div className="font-serif text-3xl text-num-ink tabular tracking-[-0.01em] text-ledger">{formatMoney(collectTot)}</div>
        </div>
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">To repay · {monthLabel}</div>
          <div className="font-serif text-3xl text-num-ink tabular tracking-[-0.01em]"><span className="neg">{formatMoney(-repayTot)}</span></div>
        </div>
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">Net</div>
          <div className={`font-serif text-3xl tabular tracking-[-0.01em] ${net >= 0 ? 'text-ledger' : 'text-danger'}`}>
            {net < 0 ? <span className="neg">{formatMoney(net)}</span> : formatMoney(net)}
          </div>
        </div>
      </div>

      {/* Tabs — scheduled cash (in the totals) vs reference items (excluded) */}
      <div className="border-b border-hairline mb-6">
        <nav className="flex gap-6" aria-label="Schedule tabs">
          <TabButton
            label={`Due · ${monthLabel}`}
            isActive={tab === 'scheduled'}
            onClick={() => setTab('scheduled')}
          />
          <TabButton
            label={`Compounding & no fixed term (${referenceCount})`}
            isActive={tab === 'reference'}
            onClick={() => setTab('reference')}
          />
        </nav>
      </div>

      {tab === 'scheduled' ? (
        <>
          {/* Toggle — only affects the scheduled tables */}
          <div className="flex items-center gap-2 mb-8">
            <span className="font-mono text-xs text-muted mr-1">View:</span>
            <button
              type="button"
              onClick={() => setMode('all')}
              className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${mode === 'all' ? 'bg-accent text-white border-accent' : 'bg-surface text-graphite border-hairline hover:text-ink'}`}
            >
              Full plan (incl. collected &amp; paid)
            </button>
            <button
              type="button"
              onClick={() => setMode('outstanding')}
              className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${mode === 'outstanding' ? 'bg-accent text-white border-accent' : 'bg-surface text-graphite border-hairline hover:text-ink'}`}
            >
              Outstanding only (approved drop off)
            </button>
          </div>

          {/* Side-by-side on wide screens: collect left, repay right */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-10">
            <ScheduleSection title="To collect — scheduled loans" rows={collectVisible} tone="credit" monthLabel={monthLabel} />
            <ScheduleSection title="To repay — scheduled fund sources" rows={repayVisible} tone="debit" monthLabel={monthLabel} />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-10">
          <div>
            <CompoundSection
              title="To collect — compounding"
              note="Principal on these loans is not being collected yet — each month's interest rolls into the balance and compounds. Not counted in the cash to collect on the other tab. Rolled interest = total interest capitalised so far."
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
          </div>
          <div>
            <CompoundSection
              title="To repay — compounding"
              note="Principal on these fund sources is not being repaid yet — monthly interest rolls into the balance. Not counted in the cash to repay on the other tab."
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
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        isActive
          ? 'pb-3 border-b-2 border-accent font-serif text-accent text-lg font-medium'
          : 'pb-3 border-b-2 border-transparent font-serif italic text-graphite text-lg hover:text-ink transition-colors'
      }
    >
      {label}
    </button>
  )
}

/** Funding-source chip — same style as the Fund OUT list's SC badge. */
function SourceChip({ source }: { source?: string | null }) {
  if (!source) return null
  return (
    <span
      className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
      title={`Source of capital: ${source}`}
    >
      SC {source}
    </span>
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
                    {r.compound ? <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5">Compound</span> : null}
                    {r.done ? <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-ledger border border-hairline rounded px-1.5 py-0.5">Paid in {monthLabel}</span> : null}
                    {r.pending ? <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-alert border border-hairline rounded px-1.5 py-0.5">Pending PV</span> : null}
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
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5">Compound</span>
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
