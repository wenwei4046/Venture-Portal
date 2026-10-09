import Link from 'next/link'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import type { DeptPoolAccrual } from '@/lib/dept-pool-accrual'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { BalanceProvider, BalanceToggle, BalanceValue } from './RevealAmount'

// Department Pools on the sheet (2026-10-09, the user's Claude Design handoff
// — Phase 4 of the Finance revamp), for whoever reads every department
// (Finance, the Principal). The page computes the figures exactly as before;
// this draws them: cards, then the tables, each closing on "All departments".
// Cash or Accrual is the sidebar's choice (?basis=).

const r2 = (n: number) => Math.round(n * 100) / 100

/** A figure in a table: bare, red in brackets below zero. */
function Fig({ v, dash = false }: { v: number; dash?: boolean }) {
  if (dash && Math.abs(v) < 0.005) return <span className="text-graphite">—</span>
  return <span className={v < 0 ? 'text-danger' : undefined}>{formatMoneyBare(v)}</span>
}

function Head({ basis, monthTitle, canNewContract }: { basis: 'CASH' | 'ACCRUAL P&L'; monthTitle: string; canNewContract: boolean }) {
  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow">
          <em>I.</em> DEPARTMENTS · {basis} · {monthTitle}
        </div>
        <h1 className="page-title">Department Pools</h1>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/dept-pool/submissions" className="btn-quiet-sheet">
          Submissions
        </Link>
        {canNewContract ? (
          <Link href="/dept-pool/contracts/new" className="btn-pri-sheet">
            New project contract
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function DeptName({ name, href, pnlHref }: { name: string; href: string | null; pnlHref: string | null }) {
  return (
    <>
      {href ? (
        <Link href={href} className="font-medium">
          {name}
        </Link>
      ) : (
        <span className="font-medium">{name}</span>
      )}
      {pnlHref ? (
        <Link href={pnlHref} className="ml-2 text-[11px] text-graphite underline underline-offset-2">
          P&amp;L
        </Link>
      ) : null}
    </>
  )
}

const VENTURE = (
  <span className="font-medium">
    Venture <span className="text-graphite font-normal">(Office)</span>
  </span>
)

// ───────── Cash ─────────

export interface CashDeptRow {
  id: string
  name: string
  href: string | null
  pnlHref: string | null
  balance: number
  inAmt: number
  outAmt: number
  /** Lifetime approved HR costing submissions for the department. */
  costing: number
}

export interface PerBankBreakdown {
  banks: Array<{ code: string; name: string; balance: number }>
  rows: Array<{ segment: string; label: string; perBank: Record<string, number>; total: number }>
  totals: { perBank: Record<string, number>; grand: number }
}

export function DeptPoolCashSheet({
  monthTitle,
  canNewContract,
  rows,
  venture,
  perBank,
  total,
}: {
  monthTitle: string
  canNewContract: boolean
  rows: CashDeptRow[]
  venture: { balance: number; in_amt: number; out_amt: number } | null
  perBank: PerBankBreakdown | null
  /** Every department's balance plus Venture's — the physical bank balance. */
  total: number
}) {
  const inAll = r2(rows.reduce((s, r) => s + r.inAmt, 0) + (venture?.in_amt ?? 0))
  const outAll = r2(rows.reduce((s, r) => s + r.outAmt, 0) + (venture?.out_amt ?? 0))
  const costingAll = r2(rows.reduce((s, r) => s + r.costing, 0))
  const below = [...rows.filter((r) => r.balance < -0.005).map((r) => r.name), ...(venture && venture.balance < -0.005 ? ['Venture (Office)'] : [])]
  const deptCount = `${rows.length} department${rows.length === 1 ? '' : 's'}${venture ? ' + Venture' : ''}`

  return (
    <div>
      <Head basis="CASH" monthTitle={monthTitle} canNewContract={canNewContract} />

      <StatCards label="Department pools, cash">
        <StatCard label="Total balance" value={formatMoney(total)} icon="layers" tone="primary" note={deptCount} />
        <StatCard label="In (to date)" value={formatMoney(inAll)} icon="inbox" tone="ledger" note="Credits since opening" />
        <StatCard label="Out (to date)" value={formatMoney(outAll)} icon="send" tone="danger" note="Debits since opening" />
        <StatCard label="Net (to date)" value={formatMoney(r2(inAll - outAll))} icon="chart" note="In − out" />
        <StatCard
          label="Below zero"
          value={String(below.length)}
          icon="alert"
          tone={below.length > 0 ? 'danger' : 'default'}
          note={below.length > 0 ? below.join(', ') : 'Every pool above zero'}
        />
      </StatCards>

      {/* Balance by bank, above By department (the handoff). */}
      {perBank ? (
        <section className="mb-10">
          <div className="sect-head">
            <h2>Balance by bank</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {perBank.banks.length} {perBank.banks.length === 1 ? 'BANK' : 'BANKS'}
            </span>
          </div>
          <div className="table-frame">
            <div className="table-frame-scroll">
              <table className="ledger-table [&_td.num]:whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Department</th>
                    {perBank.banks.map((b) => (
                      <th key={b.code} className="right m-hide">
                        {b.name} <span className="font-mono">({b.code})</span>
                      </th>
                    ))}
                    <th className="right">Total</th>
                    <th className="lt-toggle" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {perBank.rows.map((r) => (
                    <LedgerRow key={r.segment}>
                      <td>{r.label === 'Venture (Office)' ? VENTURE : <span className="font-medium">{r.label}</span>}</td>
                      {perBank.banks.map((b) => (
                        <td key={b.code} className="num m-hide" data-label={b.name}>
                          <Fig v={r.perBank[b.code] ?? 0} dash />
                        </td>
                      ))}
                      <td className="num">
                        <Fig v={r.total} />
                      </td>
                    </LedgerRow>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>All departments</td>
                    {perBank.banks.map((b) => (
                      <td key={b.code} className="num m-hide">
                        {formatMoneyBare(perBank.totals.perBank[b.code] ?? 0)}
                      </td>
                    ))}
                    <td className="num">{formatMoneyBare(perBank.totals.grand)}</td>
                    <td className="lt-toggle" aria-hidden />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <p className="text-xs text-graphite mt-3 max-w-3xl">
            Each department&rsquo;s cash slice on each HV bank account, from the journal lines. Down a bank column = that bank&rsquo;s
            balance; across a row = the department&rsquo;s total (as By department). Inter-billing recharges settle as an internal Hong
            Leong transfer between departments.
          </p>
        </section>
      ) : null}

      <section className="mb-6">
        <div className="sect-head">
          <h2>By department</h2>
          <span className="rule" aria-hidden />
          <span className="count">CASH · TO DATE</span>
        </div>
        {rows.length === 0 && !venture ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">No departments visible to your role.</p>
          </div>
        ) : (
          <BalanceProvider>
            <div className="table-frame">
              <div className="table-frame-scroll">
                <table className="ledger-table [&_td.num]:whitespace-nowrap">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th className="right">
                        <BalanceToggle label="Balance" />
                      </th>
                      <th className="right m-hide">In (to date)</th>
                      <th className="right m-hide">Out (to date)</th>
                      <th className="right m-hide">Net (to date)</th>
                      <th className="right m-hide">HR Costing Submission</th>
                      <th className="lt-toggle" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <LedgerRow key={r.id}>
                        <td>
                          <DeptName name={r.name} href={r.href} pnlHref={r.pnlHref} />
                        </td>
                        <td className="num">
                          <BalanceValue text={formatMoneyBare(r.balance)} />
                        </td>
                        <td className="num m-hide" data-label="In (to date)">
                          {formatMoneyBare(r.inAmt)}
                        </td>
                        <td className="num m-hide" data-label="Out (to date)">
                          {formatMoneyBare(r.outAmt)}
                        </td>
                        <td className="num m-hide" data-label="Net (to date)">
                          <Fig v={r2(r.inAmt - r.outAmt)} />
                        </td>
                        <td className="num m-hide" data-label="HR Costing Submission">
                          {formatMoneyBare(r.costing)}
                        </td>
                      </LedgerRow>
                    ))}
                    {venture ? (
                      <LedgerRow>
                        <td>{VENTURE}</td>
                        <td className="num">
                          <BalanceValue text={formatMoneyBare(venture.balance)} />
                        </td>
                        <td className="num m-hide" data-label="In (to date)">
                          {formatMoneyBare(venture.in_amt)}
                        </td>
                        <td className="num m-hide" data-label="Out (to date)">
                          {formatMoneyBare(venture.out_amt)}
                        </td>
                        <td className="num m-hide" data-label="Net (to date)">
                          <Fig v={r2(venture.in_amt - venture.out_amt)} />
                        </td>
                        <td className="num m-hide" data-label="HR Costing Submission">
                          {formatMoneyBare(0)}
                        </td>
                      </LedgerRow>
                    ) : null}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>All departments</td>
                      <td className="num">
                        <BalanceValue text={formatMoneyBare(total)} />
                      </td>
                      <td className="num m-hide">{formatMoneyBare(inAll)}</td>
                      <td className="num m-hide">{formatMoneyBare(outAll)}</td>
                      <td className="num m-hide">
                        <Fig v={r2(inAll - outAll)} />
                      </td>
                      <td className="num m-hide">{formatMoneyBare(costingAll)}</td>
                      <td className="lt-toggle" aria-hidden />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </BalanceProvider>
        )}
      </section>

      <p className="text-xs text-graphite max-w-3xl">
        Dept Pools: invoices settled and P&amp;L in, payroll consolidation and expenses out. Venture (Office) = every journal entry
        tagged corporate or treasury on an HV bank account. The total = every segment&rsquo;s allocation summed = the physical bank
        balance.
      </p>
    </div>
  )
}

// ───────── Accrual ─────────

export interface AccrualDeptRow {
  id: string
  name: string
  href: string | null
  pnlHref: string | null
  a: DeptPoolAccrual
}

function AccrualCells({ a }: { a: DeptPoolAccrual }) {
  return (
    <>
      <td className="num m-hide" data-label="Revenue (bill)">
        {formatMoneyBare(a.revenue)}
      </td>
      <td className="num m-hide" data-label="− Cost">
        {formatMoneyBare(a.cost)}
      </td>
      <td className="num m-hide" data-label="− Expense">
        {formatMoneyBare(a.expense)}
      </td>
      <td className="num m-hide" data-label="− Inter-billing">
        {formatMoneyBare(a.interBilling)}
      </td>
      <td className="num">
        <Fig v={a.netMargin} />
      </td>
    </>
  )
}

export function DeptPoolAccrualSheet({
  monthTitle,
  asAt,
  canNewContract,
  rows,
  venture,
}: {
  monthTitle: string
  /** D MMM YYYY — the end of the current period. */
  asAt: string
  canNewContract: boolean
  rows: AccrualDeptRow[]
  venture: DeptPoolAccrual | null
}) {
  const all = [...rows.map((r) => r.a), ...(venture ? [venture] : [])]
  const sum = (k: keyof DeptPoolAccrual) => r2(all.reduce((s, a) => s + a[k], 0))
  const totals: DeptPoolAccrual = { revenue: sum('revenue'), cost: sum('cost'), expense: sum('expense'), interBilling: sum('interBilling'), netMargin: sum('netMargin') }
  const deptCount = `${rows.length} department${rows.length === 1 ? '' : 's'}${venture ? ' + Venture' : ''}`

  return (
    <div>
      <Head basis="ACCRUAL P&L" monthTitle={monthTitle} canNewContract={canNewContract} />

      <StatCards label="Department pools, accrual">
        <StatCard label="Revenue (bill)" value={formatMoney(totals.revenue)} icon="receipt" tone="ledger" note="Invoices issued" />
        <StatCard label="Cost" value={formatMoney(totals.cost)} icon="people" note="Staff cost (HR snapshot)" />
        <StatCard label="Expense" value={formatMoney(totals.expense)} icon="wallet" tone="danger" note="Paid vouchers" />
        <StatCard label="Inter-billing" value={formatMoney(totals.interBilling)} icon="swap" note="Between departments" />
        <StatCard
          label="Net margin"
          value={formatMoney(totals.netMargin)}
          icon="chart"
          tone={totals.netMargin < 0 ? 'danger' : 'primary'}
          note={`${deptCount} · to ${asAt}`}
        />
      </StatCards>

      <section className="mb-6">
        <div className="sect-head">
          <h2>By department</h2>
          <span className="rule" aria-hidden />
          <span className="count">ACCRUAL · TO DATE</span>
        </div>
        {all.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">No departments visible to your role.</p>
          </div>
        ) : (
          <div className="table-frame">
            <div className="table-frame-scroll">
              <table className="ledger-table [&_td.num]:whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="right m-hide">Revenue (bill)</th>
                    <th className="right m-hide">− Cost</th>
                    <th className="right m-hide">− Expense</th>
                    <th className="right m-hide">− Inter-billing</th>
                    <th className="right">= Net margin</th>
                    <th className="lt-toggle" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <LedgerRow key={r.id}>
                      <td>
                        <DeptName name={r.name} href={r.href} pnlHref={r.pnlHref} />
                      </td>
                      <AccrualCells a={r.a} />
                    </LedgerRow>
                  ))}
                  {venture ? (
                    <LedgerRow>
                      <td>{VENTURE}</td>
                      <AccrualCells a={venture} />
                    </LedgerRow>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr>
                    <td>All departments</td>
                    <td className="num m-hide">{formatMoneyBare(totals.revenue)}</td>
                    <td className="num m-hide">{formatMoneyBare(totals.cost)}</td>
                    <td className="num m-hide">{formatMoneyBare(totals.expense)}</td>
                    <td className="num m-hide">{formatMoneyBare(totals.interBilling)}</td>
                    <td className="num">
                      <Fig v={totals.netMargin} />
                    </td>
                    <td className="lt-toggle" aria-hidden />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-graphite max-w-3xl">
        Accrual basis, cumulative to date: billed revenue − cost − expense − inter-billing since inception, as at {asAt}. Cash shows the
        actual pool movement.
      </p>
    </div>
  )
}
