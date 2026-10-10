'use client'

import Link from 'next/link'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import type { DeptPoolAccrual } from '@/lib/dept-pool-accrual'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { BalanceProvider, BalanceToggle, BalanceValue } from './RevealAmount'
import { executeHrCosting } from '@/app/(portal)/hr-costing/actions'
import dayjs from 'dayjs'

// Department Pools on the sheet (2026-10-09, the user's Claude Design handoff
// — Phase 4 of the Finance revamp), for whoever reads every department
// (Finance, the Principal). The page computes the figures exactly as before;
// this draws them: cards, then the tables, each closing on "All departments".
// Cash or Accrual (?basis=) is switched in the head since 2026-10-09, when the
// sidebar began listing each department's own P&L and Cash Flow instead.
// 2026-10-10 — the handoff: the tables are the sheet's (▽ on Department, a
// Range on the amounts, columns that resize and reorder), a bank's column is
// headed by its name, and a submission awaiting the Principal is blue (wait).

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
        <div className="rpt-modes" role="group" aria-label="Basis">
          {([
            ['CASH', '/dept-pool', 'Cash'],
            ['ACCRUAL P&L', '/dept-pool?basis=accrual', 'Accrual P&L'],
          ] as const).map(([b, href, label]) => (
            <Link key={b} href={href} aria-current={basis === b ? 'page' : undefined} className={basis === b ? 'btn-pri-sheet' : 'btn-quiet-sheet'}>
              {label}
            </Link>
          ))}
        </div>
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
  /** Its latest HR costing submission, if any (the status chip). */
  hr?: { id: string; state: string; period: string } | null
}

/** A submission's state as the handoff names it; one awaiting the Principal
 *  is waiting on someone — the blue wait tone (2026-10-10, was alert). */
const HR_STATE: Record<string, { label: string; tone: string }> = {
  executed: { label: 'executed', tone: 'ledger' },
  approved_for_execution: { label: 'ready to execute', tone: 'accent' },
  pending: { label: 'awaiting Principal', tone: 'wait' },
}

const hrLabel = (hr: CashDeptRow['hr']) => (hr ? HR_STATE[hr.state]?.label ?? hr.state : '—')

/** The HR Costing Submission cell: the latest submission's state as a chip
 *  (its month and the approved total on hover), and Mark executed for a ready
 *  one — the same action as the submissions page; it moves no money. */
function HrCell({ hr, costing, canExecute }: { hr: CashDeptRow['hr']; costing: number; canExecute: boolean }) {
  if (!hr) return <span className="text-graphite">—</span>
  const s = HR_STATE[hr.state] ?? { label: hr.state, tone: '' }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={`chip ${s.tone}`} title={`${dayjs(hr.period).format('MMM YYYY')} · approved to date ${formatMoney(costing)}`}>
        <span className="dot" />
        {s.label}
      </span>
      {canExecute && hr.state === 'approved_for_execution' ? (
        <form action={executeHrCosting}>
          <input type="hidden" name="id" value={hr.id} />
          <button type="submit" className="btn-quiet-sheet">
            Mark executed
          </button>
        </form>
      ) : null}
    </span>
  )
}

export interface PerBankBreakdown {
  banks: Array<{ code: string; name: string; balance: number }>
  rows: Array<{ segment: string; label: string; perBank: Record<string, number>; total: number }>
  totals: { perBank: Record<string, number>; grand: number }
}

/** The foot's label: every department, or how many a filter leaves on show. */
function footLabel(shown: number, all: number): string {
  return shown === all ? 'All departments' : `${shown} of ${all} departments`
}

const sumOf = <T,>(rows: T[], f: (r: T) => number) => r2(rows.reduce((s, r) => s + f(r), 0))

type BankRow = PerBankBreakdown['rows'][number]

/** Each department's slice of each bank. A bank is named alone in its head,
 *  unless two share a name (2026-10-10, the handoff — was "Hong Leong (1010)"). */
function BalanceByBank({ perBank, canSetDefault }: { perBank: PerBankBreakdown; canSetDefault: boolean }) {
  const head = (b: { code: string; name: string }) => (perBank.banks.filter((x) => x.name === b.name).length > 1 ? `${b.name} (${b.code})` : b.name)
  const columns: SortableColumn<BankRow>[] = [
    {
      key: 'dept',
      label: 'Department',
      mobile: 'keep',
      render: (r) => (r.label === 'Venture (Office)' ? VENTURE : <span className="font-medium">{r.label}</span>),
      sortValue: (r) => r.label,
      filterable: true,
    },
    ...perBank.banks.map(
      (b): SortableColumn<BankRow> => ({
        key: `bank:${b.code}`,
        label: head(b),
        align: 'right',
        mobile: 'detail',
        render: (r) => <Fig v={r.perBank[b.code] ?? 0} dash />,
        sortValue: (r) => r.perBank[b.code] ?? 0,
        filterable: true,
        range: 'number',
        cellClassName: 'whitespace-nowrap',
      }),
    ),
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      mobile: 'keep',
      render: (r) => <Fig v={r.total} />,
      sortValue: (r) => r.total,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
  ]
  return (
    <div className="fin-queue">
      <SortableTable<BankRow>
        layoutId="dept-pool.banks"
        layoutTitle="Balance by bank"
        canSetDefault={canSetDefault}
        scrollBox
        resizeMode="neighbour"
        rows={perBank.rows}
        columns={columns}
        getRowKey={(r) => r.segment}
        defaultSort={{ key: 'dept', dir: 'asc' }}
        footer={(visible) => {
          // Every row on show: the totals the page worked out (down a column = that bank's balance).
          const all = visible.length === perBank.rows.length
          const bank = (code: string) => (all ? perBank.totals.perBank[code] ?? 0 : sumOf(visible, (r) => r.perBank[code] ?? 0))
          return (
            <tr>
              <td colSpan={1000} className="q-foot">
                <span>{footLabel(visible.length, perBank.rows.length)}</span>
                <span className="num">
                  {perBank.banks.map((b) => `${head(b)} ${formatMoneyBare(bank(b.code))}`).join(' · ')} · Total{' '}
                  {formatMoneyBare(all ? perBank.totals.grand : sumOf(visible, (r) => r.total))}
                </span>
              </td>
            </tr>
          )
        }}
      />
    </div>
  )
}

interface DeptLine {
  key: string
  name: string
  venture: boolean
  href: string | null
  pnlHref: string | null
  balance: number
  inAmt: number
  outAmt: number
  costing: number
  hr: CashDeptRow['hr']
}

export function DeptPoolCashSheet({
  monthTitle,
  canNewContract,
  rows,
  venture,
  perBank,
  total,
  canExecuteHr = false,
  canSetDefault = false,
}: {
  monthTitle: string
  canNewContract: boolean
  rows: CashDeptRow[]
  /** Treasury · Edit — Mark executed on a ready HR costing submission. */
  canExecuteHr?: boolean
  /** The viewer may keep a table's arrangement as everyone's default. */
  canSetDefault?: boolean
  venture: { balance: number; in_amt: number; out_amt: number } | null
  perBank: PerBankBreakdown | null
  /** Every department's balance plus Venture's — the physical bank balance. */
  total: number
}) {
  const inAll = r2(rows.reduce((s, r) => s + r.inAmt, 0) + (venture?.in_amt ?? 0))
  const outAll = r2(rows.reduce((s, r) => s + r.outAmt, 0) + (venture?.out_amt ?? 0))
  const below = [...rows.filter((r) => r.balance < -0.005).map((r) => r.name), ...(venture && venture.balance < -0.005 ? ['Venture (Office)'] : [])]
  const deptCount = `${rows.length} department${rows.length === 1 ? '' : 's'}${venture ? ' + Venture' : ''}`

  const lines: DeptLine[] = [
    ...rows.map((r) => ({ key: r.id, name: r.name, venture: false, href: r.href, pnlHref: r.pnlHref, balance: r.balance, inAmt: r.inAmt, outAmt: r.outAmt, costing: r.costing, hr: r.hr ?? null })),
    ...(venture
      ? [{ key: 'venture', name: 'Venture (Office)', venture: true, href: null, pnlHref: null, balance: venture.balance, inAmt: venture.in_amt, outAmt: venture.out_amt, costing: 0, hr: null }]
      : []),
  ]
  const columns: SortableColumn<DeptLine>[] = [
    {
      key: 'dept',
      label: 'Department',
      mobile: 'keep',
      render: (r) => (r.venture ? VENTURE : <DeptName name={r.name} href={r.href} pnlHref={r.pnlHref} />),
      sortValue: (r) => r.name,
      filterable: true,
    },
    {
      // Hidden until its head shows it (the user's toggle), so it neither sorts nor filters.
      key: 'balance',
      label: 'Balance',
      header: <BalanceToggle label="Balance" />,
      align: 'right',
      mobile: 'keep',
      sortable: false,
      render: (r) => <BalanceValue text={formatMoneyBare(r.balance)} />,
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'in',
      label: 'In (to date)',
      align: 'right',
      mobile: 'detail',
      render: (r) => formatMoneyBare(r.inAmt),
      sortValue: (r) => r.inAmt,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'out',
      label: 'Out (to date)',
      align: 'right',
      mobile: 'detail',
      render: (r) => formatMoneyBare(r.outAmt),
      sortValue: (r) => r.outAmt,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'net',
      label: 'Net (to date)',
      align: 'right',
      mobile: 'detail',
      render: (r) => <Fig v={r2(r.inAmt - r.outAmt)} />,
      sortValue: (r) => r2(r.inAmt - r.outAmt),
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
    {
      key: 'hr',
      label: 'HR Costing Submission',
      mobile: 'detail',
      render: (r) => (r.venture ? <span className="text-graphite">—</span> : <HrCell hr={r.hr} costing={r.costing} canExecute={canExecuteHr} />),
      sortValue: (r) => hrLabel(r.hr),
      filterable: true,
      filterValue: (r) => hrLabel(r.hr),
    },
  ]

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
          <BalanceByBank perBank={perBank} canSetDefault={canSetDefault} />
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
        {lines.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">No departments visible to your role.</p>
          </div>
        ) : (
          <BalanceProvider>
            <div className="fin-queue">
              <SortableTable<DeptLine>
                layoutId="dept-pool.departments"
                layoutTitle="By department"
                canSetDefault={canSetDefault}
                scrollBox
                resizeMode="neighbour"
                rows={lines}
                columns={columns}
                getRowKey={(r) => r.key}
                defaultSort={{ key: 'dept', dir: 'asc' }}
                footer={(visible) => {
                  // Every row on show: the page's own totals (the balance = the physical bank balance).
                  const all = visible.length === lines.length
                  const inn = all ? inAll : sumOf(visible, (r) => r.inAmt)
                  const out = all ? outAll : sumOf(visible, (r) => r.outAmt)
                  return (
                    <tr>
                      <td colSpan={1000} className="q-foot">
                        <span>{footLabel(visible.length, lines.length)}</span>
                        <span className="num">
                          Balance <BalanceValue text={formatMoneyBare(all ? total : sumOf(visible, (r) => r.balance))} /> · In {formatMoneyBare(inn)} · Out{' '}
                          {formatMoneyBare(out)} · Net <Fig v={r2(inn - out)} />
                        </span>
                      </td>
                    </tr>
                  )
                }}
              />
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

interface AccrualLine {
  key: string
  name: string
  venture: boolean
  href: string | null
  pnlHref: string | null
  a: DeptPoolAccrual
}

const ACCRUAL_FIGURES: Array<[keyof DeptPoolAccrual, string]> = [
  ['revenue', 'Revenue (bill)'],
  ['cost', '− Cost'],
  ['expense', '− Expense'],
  ['interBilling', '− Inter-billing'],
]

export function DeptPoolAccrualSheet({
  monthTitle,
  asAt,
  canNewContract,
  rows,
  venture,
  canSetDefault = false,
}: {
  monthTitle: string
  /** D MMM YYYY — the end of the current period. */
  asAt: string
  canNewContract: boolean
  rows: AccrualDeptRow[]
  venture: DeptPoolAccrual | null
  /** The viewer may keep the table's arrangement as everyone's default. */
  canSetDefault?: boolean
}) {
  const all = [...rows.map((r) => r.a), ...(venture ? [venture] : [])]
  const sum = (k: keyof DeptPoolAccrual) => r2(all.reduce((s, a) => s + a[k], 0))
  const totals: DeptPoolAccrual = { revenue: sum('revenue'), cost: sum('cost'), expense: sum('expense'), interBilling: sum('interBilling'), netMargin: sum('netMargin') }
  const deptCount = `${rows.length} department${rows.length === 1 ? '' : 's'}${venture ? ' + Venture' : ''}`

  const lines: AccrualLine[] = [
    ...rows.map((r) => ({ key: r.id, name: r.name, venture: false, href: r.href, pnlHref: r.pnlHref, a: r.a })),
    ...(venture ? [{ key: 'venture', name: 'Venture (Office)', venture: true, href: null, pnlHref: null, a: venture }] : []),
  ]
  const columns: SortableColumn<AccrualLine>[] = [
    {
      key: 'dept',
      label: 'Department',
      mobile: 'keep',
      render: (r) => (r.venture ? VENTURE : <DeptName name={r.name} href={r.href} pnlHref={r.pnlHref} />),
      sortValue: (r) => r.name,
      filterable: true,
    },
    ...ACCRUAL_FIGURES.map(
      ([k, label]): SortableColumn<AccrualLine> => ({
        key: k,
        label,
        align: 'right',
        mobile: 'detail',
        render: (r) => formatMoneyBare(r.a[k]),
        sortValue: (r) => r.a[k],
        filterable: true,
        range: 'number',
        cellClassName: 'whitespace-nowrap',
      }),
    ),
    {
      key: 'netMargin',
      label: '= Net margin',
      align: 'right',
      mobile: 'keep',
      render: (r) => <Fig v={r.a.netMargin} />,
      sortValue: (r) => r.a.netMargin,
      filterable: true,
      range: 'number',
      cellClassName: 'whitespace-nowrap',
    },
  ]

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
        {lines.length === 0 ? (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">No departments visible to your role.</p>
          </div>
        ) : (
          <div className="fin-queue">
            <SortableTable<AccrualLine>
              layoutId="dept-pool.accrual"
              layoutTitle="By department · accrual"
              canSetDefault={canSetDefault}
              scrollBox
              resizeMode="neighbour"
              rows={lines}
              columns={columns}
              getRowKey={(r) => r.key}
              defaultSort={{ key: 'dept', dir: 'asc' }}
              footer={(visible) => {
                const every = visible.length === lines.length
                const t = (k: keyof DeptPoolAccrual) => (every ? totals[k] : sumOf(visible, (r) => r.a[k]))
                return (
                  <tr>
                    <td colSpan={1000} className="q-foot">
                      <span>{footLabel(visible.length, lines.length)}</span>
                      <span className="num">
                        Revenue {formatMoneyBare(t('revenue'))} · Cost {formatMoneyBare(t('cost'))} · Expense {formatMoneyBare(t('expense'))} · Inter-billing{' '}
                        {formatMoneyBare(t('interBilling'))} · Net margin <Fig v={t('netMargin')} />
                      </span>
                    </td>
                  </tr>
                )
              }}
            />
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
