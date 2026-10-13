import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { ratePct } from '@/lib/commission/ranks'
import type { IrGroup } from '@/lib/commission/ir-groups'
import LedgerRow from '@/components/LedgerRow'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { requireSubDepartment } from '../../../../_lib/sub-departments'
import { readRevenuePayrollAdjustments } from '../../../../_lib/payroll-adjustments'
import PayrollAdjustmentPanel from '../../../../_components/PayrollAdjustmentPanel'

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

function pct(v: number | string | null, digits = 1): string {
  if (v === null || v === undefined) return '—'
  return `${(Number(v) * 100).toFixed(digits)}%`
}

/** PostgREST embeds a to-one relation as an object or a one-element array. */
function oneOf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** The order components are paid in, so the drill-down reads top to bottom. */
const COMPONENT_ORDER = [
  'product_revenue',
  'kpi_item',
  'kpi_threshold',
  'open_bill',
  'override',
  'margin_incentive',
  'group_incentive',
] as const

const COMPONENT_LABEL: Record<string, string> = {
  product_revenue: 'Product commission',
  kpi_item: 'KPI allowance',
  kpi_threshold: 'KPI quantity bonus',
  open_bill: 'Open Bill bonus',
  override: 'Override on the downline',
  margin_incentive: 'Margin incentive',
  group_incentive: 'Group incentive',
}

interface StatementRow {
  id: string
  staff_id: string
  rank_title_id: string | null
  promotes_to_title_id: string | null
  /** Embedded `titles (name)` for each of the two title columns. */
  rank_title: { name: string } | { name: string }[] | null
  promotes_to: { name: string } | { name: string }[] | null
  base_rank_key: string | null
  rank_key: string | null
  rate_mode: 'fixed' | 'variable' | null
  qualifies_for_rank_key: string | null
  product_rate: number | string
  upline_staff_id: string | null
  product_revenue: number | string
  penalty_weighted_revenue: number | string
  group_revenue: number | string
  deferred_revenue: number | string
  excluded_revenue: number | string
  product_commission: number | string
  kpi_qty: number | string
  kpi_base: number | string
  kpi_threshold_pct: number | string
  kpi_commission: number | string
  open_bill_bonus: number | string
  override_commission: number | string
  margin_revenue: number | string
  margin_cost: number | string
  margin_pct: number | string | null
  margin_band_key: string | null
  margin_incentive: number | string
  group_incentive: number | string
  group_subsidy_cap: number | string
  group_breakdown: IrGroup[]
  full_spec: boolean
  margin_penalty_withheld: number | string
  total_commission: number | string
}

interface LineRow {
  id: string
  component: string
  source_order_id: string | null
  source_staff_id: string | null
  basis_amount: number | string
  rate: number | string | null
  qty: number | string | null
  amount: number | string
  note: string | null
}

/**
 * One salesperson's month, ringgit by ringgit.
 *
 * Everything here is read from the STATEMENT, never recomputed: the statement
 * is the snapshot the run committed to, and re-deriving it from today's config
 * would make an old month drift every time a rate is edited under Rules.
 */
export default async function CommissionStatementPage({ params }: PageProps) {
  await requirePage('/revenue/[sub]/[period]/statement/[staffId]')
  await requirePermission('revenue')
  const { sub, period, staffId } = await params
  if (!/^\d{4}-\d{2}-01$/.test(period)) notFound()

  const subDept = await requireSubDepartment(sub)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data: runData } = await supabase
    .from('comm_runs')
    .select('id, status, period_month')
    .eq('period_month', period)
    .eq('sub_department_id', subDept.id)
    .maybeSingle()
  const run = runData as { id: string; status: string } | null
  if (!run) notFound()

  const { data: stmtData } = await supabase
    .from('comm_statements')
    .select('*, rank_title:titles!comm_statements_rank_title_id_fkey (name), promotes_to:titles!comm_statements_promotes_to_title_id_fkey (name)')
    .eq('run_id', run.id)
    .eq('staff_id', staffId)
    .maybeSingle()
  const s = stmtData as StatementRow | null
  if (!s) notFound()

  const [{ data: lineData }, { data: brandData }, payrollAdjustments] = await Promise.all([
    supabase
      .from('comm_statement_lines')
      .select('id, component, source_order_id, source_staff_id, basis_amount, rate, qty, amount, note')
      .eq('statement_id', s.id),
    supabase
      .from('comm_statement_brand_margins')
      .select('brand_code, revenue, cost, margin_pct, top_band_key')
      .eq('statement_id', s.id)
      .order('brand_code'),
    readRevenuePayrollAdjustments(supabase, subDept.id, period, staffId),
  ])
  // The statement snapshots the rank KEY; the ladder says what letter it
  // wears today — the rung's label, a trigger-kept copy of its rank's
  // (comm_rank_defs, 2026-09-05). A key the ladder no longer carries shows as
  // itself.
  const { data: rankRows } = subDept.schemeId
    ? await supabase.from('comm_ranks').select('rank_key, label').eq('scheme_id', subDept.schemeId)
    : { data: null }
  const ladder = (rankRows ?? []) as Array<{ rank_key: string; label: string }>
  const rankNameOf = (key: string | null) => {
    if (!key) return null
    return ladder.find(x => x.rank_key === key)?.label ?? key
  }

  const lines = (lineData ?? []) as unknown as LineRow[]
  const brands = (brandData ?? []) as unknown as Array<{
    brand_code: string
    revenue: number | string
    cost: number | string
    margin_pct: number | string | null
    top_band_key: string | null
  }>

  // Names: this person, their upline, and every downline an override came from.
  const ids = [
    staffId,
    ...(s.upline_staff_id ? [s.upline_staff_id] : []),
    ...lines.flatMap(l => (l.source_staff_id ? [l.source_staff_id] : [])),
    ...(s.group_breakdown ?? []).map(g => g.directStaffId),
  ]
  const { data: staffRows } = await supabase
    .from('hr_staff_costs')
    .select('id, employee_name, employee_code')
    .in('id', [...new Set(ids)])
  const staff = new Map(
    ((staffRows ?? []) as Array<{ id: string; employee_name: string; employee_code: string | null }>).map(
      r => [r.id, r],
    ),
  )
  const me = staff.get(staffId)

  const byComponent = COMPONENT_ORDER.map(c => ({
    component: c as string,
    rows: lines.filter(l => l.component === c),
    subtotal: lines.filter(l => l.component === c).reduce((a, l) => a + Number(l.amount), 0),
  })).filter(g => g.rows.length > 0)

  const total = Number(s.total_commission)
  const withheld = Number(s.margin_penalty_withheld)
  const runSynced = run.status === 'applied' || run.status === 'locked'
  const personName = me?.employee_name ?? staffId
  // The person header's two lines: where they sit, then the rung they are paid at.
  const placeLine = [
    oneOf(s.rank_title)?.name ?? null,
    s.upline_staff_id ? `under ${staff.get(s.upline_staff_id)?.employee_name ?? 'an upline'}` : 'top of a tree',
  ]
    .filter(Boolean)
    .join(' · ')
  const rankLine = [
    rankNameOf(s.rank_key) ?? 'no rank',
    Number(s.group_incentive) > 0 ? 'Group package' : ratePct(Number(s.product_rate)),
    s.rate_mode === 'fixed' ? 'Manual rate' : 'Scheme rate',
  ].join(' · ')
  const qualifies = Boolean(s.qualifies_for_rank_key && s.qualifies_for_rank_key !== s.rank_key)

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">Commission statement</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`${revenuePath(subDept.slug, period, 'orders')}?staff=${staffId}`}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            Their bills
          </Link>
          <Link
            href={revenuePath(subDept.slug, period, 'pay', staffId)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            What this pays
          </Link>
          <Link
            href={revenuePath(subDept.slug, period)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
          >
            ← The run
          </Link>
        </div>
      </div>

      {/* The page's one dark object: the salesperson's person header, as the
          month's ledger draws it (CommissionWorkbench) — the month and the
          run's state on top, then who they are, and the source commission on
          the right. .hero-walnut re-lights the tokens inside it, so ink,
          graphite, hairline and the chips read light on the walnut. */}
      <section className="hero-walnut text-ink px-5 pt-5 pb-6 md:px-7 md:pt-6 md:pb-7 mb-8" aria-label={`${personName} · commission statement`}>
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-5 md:pb-6 text-graphite">
          <span className="text-[10px] font-medium uppercase tracking-[0.09em]">Commission · {label(period)}</span>
          <span className="text-[10px] px-2 py-1 border border-muted/70 rounded-sm text-ink">Run {run.status}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div
            aria-hidden
            className="grid place-items-center shrink-0 w-[52px] h-[52px] rounded-lg border border-hairline bg-surface text-lg font-medium"
          >
            {personName.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-[160px]">
            <h2 className="text-[25px] md:text-[28px] leading-[1.3] font-medium tracking-[-0.03em] text-num-ink">{personName}</h2>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-graphite">
              <span>{placeLine}</span>
              <span className="text-ink">{rankLine}</span>
            </p>
          </div>
          <div className="w-full md:w-auto flex flex-col items-start md:items-end gap-[7px] mt-[3px] md:mt-0 pt-[18px] md:pt-0 md:pl-6 border-t md:border-t-0 md:border-l border-hairline">
            <span className="text-xs text-graphite">Source commission · {subDept.name}</span>
            <strong className="text-[30px] md:text-[clamp(30px,3vw,42px)] leading-[1.15] font-medium tracking-[-0.045em] tabular-nums text-num-ink">
              {formatMoney(total)}
            </strong>
            <small className="text-[10px] text-graphite">{lines.length} lines</small>
          </div>
        </div>
        {/* A promotion is a state, so it is a word on a wash: green once it
            has landed, orange while it waits on a decision or a sync. */}
        {qualifies || s.promotes_to_title_id ? (
          <div className="mt-5 pt-4 border-t border-hairline space-y-2 text-xs text-graphite">
            {qualifies ? (
              <p>
                <span className={`chip ${s.rate_mode === 'fixed' ? 'accent' : 'ledger'}`}>
                  <span className="dot" />
                  Group sales clear <strong>{rankNameOf(s.qualifies_for_rank_key)}</strong>
                </span>
                {s.rate_mode === 'fixed'
                  ? ' — a promotion to consider, not applied, because their rate is set manually.'
                  : ' — already applied this month.'}
              </p>
            ) : null}
            {s.promotes_to_title_id ? (
              <p>
                <span className={`chip ${runSynced ? 'ledger' : 'accent'}`}>
                  <span className="dot" />
                  {runSynced ? 'Title raised to ' : 'Syncing this run raises their title to '}
                  <strong>{oneOf(s.promotes_to)?.name ?? 'a higher title'}</strong>
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <PayrollAdjustmentPanel read={payrollAdjustments} periodLabel={label(period)}
        staffNames={new Map([[staffId, me?.employee_name ?? staffId]])} statement />

      {/* The month's inputs to the statement. No card here is primary: the
          figure this page is opened for is the source commission in the
          person header above — the sheet keeps one dark object. The two
          memo figures turn red only while money is actually held back. */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>The month in figures</h2>
          <span className="rule" aria-hidden />
        </div>
        <StatCards label="The month in figures">
          <StatCard label="Own commissionable revenue" value={formatMoney(Number(s.product_revenue))} icon="sales" />
          <StatCard
            label="Group sales"
            value={formatMoney(Number(s.group_revenue))}
            icon="people"
            note={(s.group_breakdown ?? []).length > 0 ? 'Own plus two downline layers, each person counted once. Individual group targets below may reuse own sales.' : 'Own plus the scheme’s qualifying downline layers. A sales figure — the margin penalty does not reduce it.'}
          />
          <StatCard
            label="Held by the deposit gate"
            value={formatMoney(Number(s.deferred_revenue))}
            icon="clock"
            note="Pays in the month the deposit clears."
            tone={Number(s.deferred_revenue) > 0 ? 'danger' : undefined}
          />
          <StatCard
            label="Not commissionable"
            value={formatMoney(Number(s.excluded_revenue))}
            icon="tag"
            note="Transport, disposal and anything in an unclassified item group."
          />
          <StatCard
            label="Penalty-weighted revenue"
            value={formatMoney(Number(s.penalty_weighted_revenue))}
            icon="tree"
            note="What the upline overrides on, so a bill cut for margin cuts the override too."
          />
          <StatCard label="KPI units" value={Number(s.kpi_qty).toLocaleString()} icon="gift" />
          <StatCard
            label="KPI base"
            value={formatMoney(Number(s.kpi_base))}
            icon="coin"
            note={
              Number(s.kpi_threshold_pct) > 0
                ? `Uplifted ${pct(s.kpi_threshold_pct, 0)} for clearing the quantity ladder.`
                : undefined
            }
          />
          <StatCard
            label="Commission withheld for margin"
            value={formatMoney(withheld)}
            icon="percent"
            note="Memo — the lines below are already net of it."
            tone={withheld > 0 ? 'danger' : undefined}
          />
        </StatCards>
      </section>

      {brands.length > 0 ? (
        <section className="mb-10">
          <div className="sect-head">
            <h2>Margin, brand by brand</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {s.margin_band_key ? s.margin_band_key.toUpperCase() : 'NO TIER CLEARED'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th className="right">Revenue</th>
                  <th className="right">Cost</th>
                  <th className="right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {brands.map(b => (
                  <tr key={b.brand_code}>
                    <td className="font-mono text-[11px] font-medium">{b.brand_code}</td>
                    <td className="num">{formatMoney(Number(b.revenue))}</td>
                    <td className="num">{formatMoney(Number(b.cost))}</td>
                    <td className={b.margin_pct === null ? 'num neg' : 'num'}>
                      {b.margin_pct === null ? 'no cost' : pct(b.margin_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Every brand together — the peach total band. */}
              <tfoot>
                <tr>
                  <td>All brands</td>
                  <td className="num">{formatMoney(Number(s.margin_revenue))}</td>
                  <td className="num">{formatMoney(Number(s.margin_cost))}</td>
                  <td className={s.margin_pct === null ? 'num neg' : 'num'}>
                    {s.margin_pct === null ? 'no cost' : pct(s.margin_pct)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : null}

      {(s.group_breakdown ?? []).length > 0 ? (
        <section className="mb-10">
          <div className="sect-head">
            <h2>Direct-line group targets</h2>
            <span className="rule" aria-hidden />
            <span className="count">{s.group_breakdown.filter(g => g.qualifies).length} QUALIFIED</span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead><tr>
                <th>Direct line</th><th className="right m-hide">Your sales</th>
                <th className="right m-hide">Direct sales</th><th className="right m-hide">Second layer</th>
                <th className="right">Group target basis</th><th className="m-hide">Result</th>
                <th className="lt-toggle" aria-hidden />
              </tr></thead>
              <tbody>{s.group_breakdown.map(g => (
                <LedgerRow key={g.directStaffId}>
                  <td className="font-medium">{staff.get(g.directStaffId)?.employee_name ?? g.directStaffId}</td>
                  <td className="num m-hide" data-label="Your sales (reused)">{formatMoney(g.leaderPersonalRevenue)}</td>
                  <td className="num m-hide" data-label="Direct sales">{formatMoney(g.directPersonalRevenue)}</td>
                  <td className="num m-hide" data-label="Second layer">{formatMoney(g.secondLayerRevenue)}</td>
                  <td className="num">{formatMoney(g.totalRevenue)}</td>
                  <td className="m-hide" data-label="Result">
                    {/* The result is a state: green once the group clears its target. */}
                    <span className={g.qualifies ? 'chip ledger' : 'chip'}>
                      <span className="dot" />
                      {g.qualifies ? 'Qualified' : 'Below target'}
                    </span>
                    {g.targetRevenue ? ` · ${formatMoney(g.targetRevenue)}` : ''}
                  </td>
                </LedgerRow>
              ))}</tbody>
            </table>
          </div>
          {/* The state, and the step still owed when there is one (2026-10-12) — the rule's sentences went. */}
          {s.full_spec ? (
            <p className="text-sm mt-3">
              <span className="chip ledger">
                <span className="dot" />
                Full Spec achieved
              </span>
              {Number(s.group_incentive) > 0 ? null : ' The current manual percentage rank must be changed to the group package before the SDL qualification can be awarded.'}
            </p>
          ) : null}
          {Number(s.group_subsidy_cap) > 0 ? <p className="text-sm mt-3">Car/property subsidy cap: <strong>{formatMoney(Number(s.group_subsidy_cap))}</strong></p> : null}
        </section>
      ) : null}

      {byComponent.map(group => (
        <section key={group.component} className="mb-10">
          <div className="sect-head">
            <h2>{COMPONENT_LABEL[group.component] ?? group.component}</h2>
            <span className="rule" aria-hidden />
            <span className="count">{formatMoney(group.subtotal)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>What it is</th>
                  <th className="right m-hide">Basis</th>
                  <th className="right m-hide">Rate</th>
                  <th className="right m-hide">Qty</th>
                  <th className="right">Amount</th>
                  <th className="lt-toggle" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {group.rows.map(l => (
                  <LedgerRow key={l.id}>
                    <td>
                      <div className="font-medium">
                        {l.source_staff_id
                          ? (staff.get(l.source_staff_id)?.employee_name ?? l.source_staff_id)
                          : (l.note ?? '—')}
                      </div>
                      {l.source_staff_id && l.note ? (
                        <div className="font-mono text-[11px] mt-0.5">{l.note}</div>
                      ) : null}
                    </td>
                    <td className="num m-hide" data-label="Basis">{formatMoney(Number(l.basis_amount))}</td>
                    <td className="num m-hide" data-label="Rate">{l.rate === null ? '—' : pct(l.rate, 2)}</td>
                    <td className="num m-hide" data-label="Qty">{l.qty === null ? '—' : Number(l.qty).toLocaleString()}</td>
                    <td className="num">{formatMoney(Number(l.amount))}</td>
                  </LedgerRow>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section>
        <div className="sect-head">
          <h2>Total</h2>
          <span className="rule" aria-hidden />
        </div>
        <div className="overflow-x-auto">
          <table className="ledger-table">
            <tbody>
              <Sum name="Product commission" value={Number(s.product_commission)} />
              <Sum name="KPI allowance" value={Number(s.kpi_commission)} />
              <Sum name="Open Bill bonus" value={Number(s.open_bill_bonus)} />
              <Sum name="Override" value={Number(s.override_commission)} />
              <Sum name="Margin incentive" value={Number(s.margin_incentive)} />
              {Number(s.group_incentive) > 0 ? <Sum name="Group incentive" value={Number(s.group_incentive)} /> : null}
            </tbody>
            {/* The sum of the components — the peach total band. */}
            <tfoot>
              <tr>
                <td>Source commission · {subDept.name}</td>
                <td className="num">{formatMoney(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  )
}

function Sum({ name, value }: { name: string; value: number }) {
  return (
    <tr>
      <td>{name}</td>
      <td className="num">{formatMoney(value)}</td>
    </tr>
  )
}
