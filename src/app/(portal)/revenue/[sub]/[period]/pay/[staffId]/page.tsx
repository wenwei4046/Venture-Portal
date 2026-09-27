import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { ratePct } from '@/lib/commission/ranks'
import { payLineKind, payLineLabel } from '@/lib/revenue-pay-lines'
import LedgerRow from '@/components/LedgerRow'
import { requireSubDepartment } from '../../../../_lib/sub-departments'
import { loadPayBoard } from '../../../../_lib/pay-preview'

interface PageProps {
  params: Promise<{ sub: string; period: string; staffId: string }>
}

function label(period: string): string {
  return new Date(period + 'T00:00:00Z').toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function pct(v: number | null, digits = 1): string {
  return v === null ? '—' : `${(v * 100).toFixed(digits)}%`
}

interface OpenBillLine {
  id: string
  amount: number | string
  basis_amount: number | string
  rate: number | string | null
  note: string | null
  source_order_id: string | null
}

/**
 * One salesperson's payslip for the month, before payroll has written a thing.
 *
 * WRITTEN FOR WHOEVER RUNS THE PAYROLL, not for whoever runs the sales floor.
 * The commission statement already explains the commission; what it never said
 * is what reaches the bank — so this page starts where the statement ends, at
 * the gross commission, and walks it down: the employer's contributions come
 * out of it first (that is what a commissioned payroll means), then the
 * employee's, then the tax, and what is left is the payment. Every figure is
 * accompanied by the rule that produced it, Open Bill included, because a
 * payslip nobody can argue with is a payslip somebody can check.
 */
export default async function StaffPayPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub, period, staffId } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const board = await loadPayBoard(supabase, subDept.id, period)
  const row = board.rows.find(r => r.staffId === staffId)
  if (!row) notFound()

  const [{ data: statementData }, { data: rulesData }, { data: rankRows }] = await Promise.all([
    supabase
      .from('comm_statements')
      .select('id')
      .eq('run_id', board.runId ?? '')
      .eq('staff_id', staffId)
      .maybeSingle(),
    subDept.schemeId
      ? supabase
          .from('comm_open_bill_rules')
          .select('bill_rank, pct')
          .eq('scheme_id', subDept.schemeId)
          .order('bill_rank')
      : Promise.resolve({ data: null }),
    subDept.schemeId
      ? supabase.from('comm_ranks').select('rank_key, label').eq('scheme_id', subDept.schemeId)
      : Promise.resolve({ data: null }),
  ])

  const statementId = (statementData as { id: string } | null)?.id ?? null
  const { data: lineData } = statementId
    ? await supabase
        .from('comm_statement_lines')
        .select('id, amount, basis_amount, rate, note, source_order_id')
        .eq('statement_id', statementId)
        .eq('component', 'open_bill')
    : { data: null }

  const openBillLines = (lineData ?? []) as unknown as OpenBillLine[]
  const rules = (rulesData ?? []) as Array<{ bill_rank: number; pct: number | string }>
  const ladder = (rankRows ?? []) as Array<{ rank_key: string; label: string }>
  const rankName = row.components?.rankKey
    ? (ladder.find(x => x.rank_key === row.components?.rankKey)?.label ?? row.components.rankKey)
    : null

  const c = row.components
  const pay = row.pay
  const earningLines = (row.lines ?? []).filter(line => !payLineKind(line.kind).deduction)
  const deductionLines = (row.lines ?? []).filter(line => payLineKind(line.kind).deduction)
  const earnings: Array<[string, number, string | null]> = c
    ? [
        ['Product commission', c.productCommission, `${ratePct(c.productRate)} of own commissionable sales`],
        ['KPI allowance', c.kpiCommission, 'A flat amount for each KPI unit moved'],
        ['Open Bill bonus', c.openBillBonus, 'The 1st / 2nd / 3rd bill of an event day'],
        ['Override on the downline', c.overrideCommission, 'The rate differential on their downline’s sales'],
        ['Margin incentive', c.marginIncentive, 'Monthly, and only if every brand sold clears the tier'],
        ['Group incentive', c.groupIncentive, 'One fixed reward per qualifying direct-line group'],
      ].filter(([, v]) => Number(v) !== 0) as Array<[string, number, string | null]>
    : []
  // The person header's second line: the rung they are paid at.
  const rankLine = [
    rankName,
    c ? ratePct(c.productRate) : null,
    row.employmentType === 'commission_eligible' ? 'fully commissioned' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">Payslip</h1>
        </div>
        {/* No "Their bills" here (2026-09-27): the salesperson's ledger on Comm
            Cal already lists every bill of theirs, and it is where this page
            is opened from — user: 感觉是之前留下来的，有点 duplicate。 */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={revenuePath(subDept.slug, period, 'pay')}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            ← The board
          </Link>
        </div>
      </div>

      {/* The page's one dark object: the salesperson's person header, as the
          month's ledger draws it (CommissionWorkbench) — the month and the
          payroll state on top, then who they are, and what reaches the bank
          on the right. .hero-walnut re-lights the tokens inside it, so ink,
          graphite and hairline read light on the walnut. */}
      <section className="hero-walnut text-ink px-5 pt-5 pb-6 md:px-7 md:pt-6 md:pb-7 mb-4" aria-label={`${row.employeeName} · payslip`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-5 md:pb-6 text-graphite">
          <span className="text-[10px] font-medium uppercase tracking-[0.09em]">Payslip · {label(period)}</span>
          <span className="text-[10px] px-2 py-1 border border-muted/70 rounded-sm text-ink">
            {row.payrollExists ? `Payroll ${String(row.payrollStatus)}` : 'Not in payroll yet'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div
            aria-hidden
            className="grid place-items-center shrink-0 w-[52px] h-[52px] rounded-lg border border-hairline bg-surface text-lg font-medium"
          >
            {row.employeeName.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-[160px]">
            <h2 className="text-[25px] md:text-[28px] leading-[1.3] font-medium tracking-[-0.03em] text-num-ink">
              {row.employeeName}
            </h2>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-graphite">
              <span>
                {row.employeeCode ? `${row.employeeCode} · ` : ''}
                {row.designation ?? 'no title'}
              </span>
              {rankLine ? <span className="text-ink">{rankLine}</span> : null}
            </p>
          </div>
          <div className="w-full md:w-auto flex flex-col items-start md:items-end gap-[7px] mt-[3px] md:mt-0 pt-[18px] md:pt-0 md:pl-6 border-t md:border-t-0 md:border-l border-hairline">
            <span className="text-xs text-graphite">Net pay</span>
            <strong className="text-[30px] md:text-[clamp(30px,3vw,42px)] leading-[1.15] font-medium tracking-[-0.045em] tabular-nums text-num-ink">
              {formatMoney(pay.net)}
            </strong>
            <small className="text-[10px] text-graphite">
              {formatMoney(row.commission)} commission
              {pay.ratio < 1 ? ` · ${row.input.daysWorked}/${row.input.daysInMonth} days` : ''}
            </small>
          </div>
        </div>
      </section>

      {row.differsFromPayroll ? (
        <p className="sheet-warning">
          Payroll holds {formatMoney(row.payrollNet ?? 0)} for this month. Either it was keyed there, or
          the run was recomputed after it was synced — re-sync the run, or record the difference as a
          reviewed adjustment.
        </p>
      ) : null}
      {pay.shortfall > 0 ? (
        <p className="sheet-warning">
          The commission does not cover the basic and the employer&apos;s contributions —{' '}
          <strong>{formatMoney(pay.shortfall)} short</strong>. Settle it before payroll goes out.
        </p>
      ) : null}

      <section className="mt-8 mb-10">
        <div className="sect-head">
          <h2>Earnings</h2>
          <span className="rule" aria-hidden />
          <span className="count">{formatMoney(row.commission)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>What it is</th>
                <th className="m-hide">The rule</th>
                <th className="right">Amount</th>
                <th className="lt-toggle" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {earnings.map(([name, amount, rule]) => (
                <LedgerRow key={name}>
                  <td className="font-medium">{name}</td>
                  <td className="m-hide" data-label="The rule">{rule}</td>
                  <td className="num">{formatMoney(amount)}</td>
                </LedgerRow>
              ))}
              {c && c.marginPenaltyWithheld > 0 ? (
                <LedgerRow>
                  <td className="font-medium">Withheld for margin</td>
                  <td className="m-hide" data-label="The rule">
                    Already taken off the lines above — the bills that fell below their band
                    {c.marginPct !== null ? `, at ${pct(c.marginPct)} overall` : ''}
                  </td>
                  <td className="num neg">({formatMoney(c.marginPenaltyWithheld)})</td>
                </LedgerRow>
              ) : null}
              {row.commissionElsewhere > 0 ? (
                <LedgerRow>
                  <td className="font-medium">Another programme</td>
                  <td className="m-hide" data-label="The rule">
                    Runs already applied for this month outside {subDept.name}
                  </td>
                  <td className="num">{formatMoney(row.commissionElsewhere)}</td>
                </LedgerRow>
              ) : null}
              {row.payrollAdjustment !== 0 ? (
                <LedgerRow>
                  <td className="font-medium">Reviewed payroll adjustment</td>
                  <td className="m-hide" data-label="The rule">Keyed against the payroll row</td>
                  <td className="num">{formatMoney(row.payrollAdjustment)}</td>
                </LedgerRow>
              ) : null}
            </tbody>
            {/* The sum of the lines above — the peach total band. */}
            <tfoot>
              <tr>
                <td>Gross commission</td>
                <td className="m-hide" />
                <td className="num">{formatMoney(row.commission)}</td>
                <td className="lt-toggle" aria-hidden />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ── Open Bill, and the rule that pays it ────────────────────────── */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>Open Bill</h2>
          <span className="rule" aria-hidden />
          <span className="count">{formatMoney(c?.openBillBonus ?? 0)}</span>
        </div>
        <p className="text-sm mb-4 max-w-3xl">
          The first bills of an event day earn an uplift on top of their ordinary commission —
          {rules.length > 0
            ? ` ${rules.map(r => `${ordinal(r.bill_rank)} +${Math.round(Number(r.pct) * 100)}%`).join(', ')}`
            : ' no rates are configured'}
          . The ERP&apos;s feed suggests which bill is which from the real time each was written; a pick made
          by hand is never overwritten.
        </p>
        {openBillLines.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th className="right m-hide">Commissionable</th>
                  <th className="right m-hide">Uplift</th>
                  <th className="right">Bonus</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {openBillLines.map(l => (
                  <LedgerRow key={l.id}>
                    <td>
                      {l.source_order_id ? (
                        <Link
                          href={revenuePath(subDept.slug, period, 'orders', l.source_order_id)}
                          className="font-medium"
                        >
                          {l.note ?? '—'}
                        </Link>
                      ) : (
                        <span className="font-medium">{l.note ?? '—'}</span>
                      )}
                    </td>
                    <td className="num m-hide" data-label="Commissionable">
                      {formatMoney(Number(l.basis_amount))}
                    </td>
                    <td className="num m-hide" data-label="Uplift">
                      {l.rate === null ? '—' : pct(Number(l.rate), 0)}
                    </td>
                    <td className="num">{formatMoney(Number(l.amount))}</td>
                  </LedgerRow>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
            <p className="text-sm">
              No bill of theirs was tagged as an Open Bill this month
              {c && c.openBillBonus !== 0 ? ', yet the statement carries a bonus — recompute the run.' : '.'}
            </p>
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="sect-head">
          <h2>From commission to net pay</h2>
          <span className="rule" aria-hidden />
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <tbody>
              <Step name="Gross commission" value={row.commission} strong />
              {pay.employerContributions > 0 ? (
                <>
                  <Step
                    name="Less employer EPF"
                    value={-row.input.epfEr}
                    note="Funded from the commission, not added to it"
                  />
                  <Step name="Less employer SOCSO" value={-row.input.socsoEr} />
                  <Step name="Less employer EIS" value={-row.input.eisEr} />
                </>
              ) : (
                <Step
                  name="Employer EPF / SOCSO / EIS"
                  value={0}
                  note={`Nil — the statutory wage is ${formatMoney(pay.statutoryWages)}, and the schedules start above it`}
                />
              )}
              {pay.proratedStatutoryAllowance > 0 ? (
                <Step name="Statutory allowance" value={pay.proratedStatutoryAllowance} />
              ) : null}
              {pay.proratedOt > 0 ? <Step name="Overtime" value={pay.proratedOt} /> : null}
              {row.input.nonStatutoryAllowance > 0 ? (
                <Step name="Non-statutory allowance" value={row.input.nonStatutoryAllowance} />
              ) : null}
              {/* Pay lines HR added on Comm Cal (2026-09-27): earnings here,
                  in full; deductions after the tax, off take-home only. */}
              {earningLines.map(line => (
                <Step key={line.id} name={payLineLabel(line)} value={line.amount} note="Pay line — paid in full, no EPF / SOCSO / EIS" />
              ))}
              {row.input.deductionAmount > 0 ? (
                <Step name="Less deduction" value={-row.input.deductionAmount} />
              ) : null}
              <Step name="Gross pay" value={pay.gross} strong />
              {row.input.epfEe > 0 ? <Step name="Less employee EPF" value={-row.input.epfEe} /> : null}
              {row.input.socsoEe > 0 ? <Step name="Less employee SOCSO" value={-row.input.socsoEe} /> : null}
              {row.input.eisEe > 0 ? <Step name="Less employee EIS" value={-row.input.eisEe} /> : null}
              {pay.pcb > 0 ? (
                <Step
                  name="Less PCB"
                  value={-pay.pcb}
                  note="Looked up on the basic after employee EPF — commission does not raise it"
                />
              ) : null}
              {pay.withholdingTax > 0 ? (
                <Step
                  name="Less withholding tax"
                  value={-pay.withholdingTax}
                  note={`${pct(row.input.withholdingRate, 0)} of gross pay`}
                />
              ) : null}
              {row.input.skbbkAmount > 0 ? <Step name="Less SKBBK" value={-row.input.skbbkAmount} /> : null}
              {deductionLines.map(line => (
                <Step key={line.id} name={`Less ${payLineLabel(line)}`} value={-line.amount} note="Pay line — off take-home pay only" />
              ))}
            </tbody>
            {/* Where the walk ends — the peach total band. */}
            <tfoot>
              <Step name="Net pay" value={pay.net} strong />
            </tfoot>
          </table>
        </div>
        {pay.basicPayNet !== 0 ? (
          <p className="text-xs mt-3 max-w-3xl">
            Paid as two salary lines: net basic {formatMoney(pay.basicPayNet)} and a commission balance of{' '}
            {formatMoney(pay.commissionBalance)}. The basic is carved out of the commission, not added to it,
            so the two add back to the net above.
          </p>
        ) : (
          <p className="text-xs mt-3 max-w-3xl">
            No basic is set on this record, so the whole net is the commission balance — one salary line.
          </p>
        )}
      </section>

      <section>
        <div className="sect-head">
          <h2>What the statutory figures are read from</h2>
          <span className="rule" aria-hidden />
        </div>
        <dl className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
          <Fact label="Statutory wage" value={formatMoney(pay.statutoryWages)} note="Basic + statutory allowance, pro-rated" />
          <Fact
            label="Days worked"
            value={`${row.input.daysWorked} / ${row.input.daysInMonth}`}
            note={pay.ratio < 1 ? 'Joined, left or on unpaid leave this month' : 'A full month'}
          />
          <Fact
            label="Tax"
            value={
              row.input.taxMode === 'withholding'
                ? `Withholding ${pct(row.input.withholdingRate, 0)}`
                : row.input.taxMode === 'none'
                  ? 'None'
                  : 'PCB schedule'
            }
          />
          <Fact
            label="Own sales this month"
            value={formatMoney(c?.productRevenue ?? 0)}
            note={
              c && c.deferredRevenue > 0
                ? `${formatMoney(c.deferredRevenue)} more is held by the deposit gate`
                : undefined
            }
          />
        </dl>
        <p className="text-xs mt-4 max-w-3xl">
          Every contribution is a schedule lookup, never a percentage: EPF from the Third Schedule, SOCSO from
          Act 4, EIS from Act 800, PCB from the Jadual. This page reads the same tables the payroll trigger
          reads, so what it shows is what payroll will write.
        </p>
      </section>
    </div>
  )
}

function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

function Step({
  name,
  value,
  note,
  strong,
}: {
  name: string
  value: number
  note?: string
  strong?: boolean
}) {
  return (
    <tr>
      <td>
        <span className={strong ? 'font-bold' : undefined}>{name}</span>
        {note ? <div className="text-[11px] mt-0.5">{note}</div> : null}
      </td>
      <td className={strong ? 'num font-bold' : 'num'}>
        {value < 0 ? <span className="neg">({formatMoney(Math.abs(value))})</span> : formatMoney(value)}
      </td>
    </tr>
  )
}

/** One input the statutory lookups read — the month ledger's compact summary
 *  cell (quieter than a summary card: these explain the payslip, they are not
 *  what it is opened for). */
function Fact({ label: text, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 border border-hairline rounded-md bg-surface-2 px-4 py-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em]">{text}</dt>
      <dd className="mt-1.5 text-[19px] leading-tight font-bold tabular-nums tracking-[-0.025em]">{value}</dd>
      {note ? <dd className="mt-1.5 text-[11px] leading-[1.5]">{note}</dd> : null}
    </div>
  )
}
