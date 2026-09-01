import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import LedgerRow from '@/components/LedgerRow'
import { requireSubDepartment } from '../../../../_lib/sub-departments'

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

/** The order components are paid in, so the drill-down reads top to bottom. */
const COMPONENT_ORDER = [
  'product_revenue',
  'kpi_item',
  'kpi_threshold',
  'open_bill',
  'override',
  'margin_incentive',
] as const

const COMPONENT_LABEL: Record<string, string> = {
  product_revenue: 'Product commission',
  kpi_item: 'KPI allowance',
  kpi_threshold: 'KPI quantity bonus',
  open_bill: 'Open Bill bonus',
  override: 'Override on the downline',
  margin_incentive: 'Margin incentive',
}

const COMPONENT_NOTE: Record<string, string> = {
  product_revenue:
    'One line per bill, at the rank rate, already net of any below-margin penalty on that bill.',
  kpi_item:
    'A flat amount per KPI unit. Their revenue leaves the commission base — the allowance is what pays for them, which is the point when they are given away free.',
  kpi_threshold: 'Uplift on the whole KPI base for clearing the quantity ladder.',
  open_bill:
    'The 1st / 2nd / 3rd bill of an event day, on top of that bill’s commission at the current rate.',
  override:
    'The differential between this person’s rate and the downline’s, on the downline’s penalty-weighted revenue. Equal rates compress to nothing.',
  margin_incentive:
    'Monthly, and judged brand by brand: every brand sold has to clear the tier. Incentive rungs stack.',
}

interface StatementRow {
  id: string
  staff_id: string
  tier_key: string | null
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
    .select('*')
    .eq('run_id', run.id)
    .eq('staff_id', staffId)
    .maybeSingle()
  const s = stmtData as StatementRow | null
  if (!s) notFound()

  const [{ data: lineData }, { data: brandData }] = await Promise.all([
    supabase
      .from('comm_statement_lines')
      .select('id, component, source_order_id, source_staff_id, basis_amount, rate, qty, amount, note')
      .eq('statement_id', s.id),
    supabase
      .from('comm_statement_brand_margins')
      .select('brand_code, revenue, cost, margin_pct, top_band_key')
      .eq('statement_id', s.id)
      .order('brand_code'),
  ])
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

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()} · {label(period).toUpperCase()}
          </div>
          <h1 className="page-title">{me?.employee_name ?? staffId}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {s.rank_key ?? 'no rank'} at {pct(s.product_rate, 0)}
            {s.rate_mode === 'fixed' ? ' · Manual rate' : ' · Scheme rate'}
            {s.upline_staff_id
              ? ` · under ${staff.get(s.upline_staff_id)?.employee_name ?? 'an upline'}`
              : ' · top of a tree'}
          </p>
        </div>
        <Link
          href={revenuePath(subDept.slug, period)}
          className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-control transition-colors"
        >
          ← The run
        </Link>
      </div>

      {/* The page's one dark object — .hero-walnut in globals.css. */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
        <div className="lg:col-span-7 hero-walnut px-6 py-6 md:px-8 md:py-7">
          <div className="font-serif italic text-accent text-base mb-1">Commission earned</div>
          <div className="font-serif text-[30px] sm:text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
            {formatMoney(total)}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium uppercase">
            {lines.length} LINES · {label(period).toUpperCase()}
          </div>
          {s.qualifies_for_rank_key && s.qualifies_for_rank_key !== s.rank_key ? (
            <p className="font-serif italic text-accent text-sm mt-3">
              Group sales clear <strong>{s.qualifies_for_rank_key}</strong>
              {s.rate_mode === 'fixed'
                ? ' — a promotion to consider, not applied, because their rate is set manually.'
                : ' — already applied this month.'}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mb-10">
        <div className="sect-head">
          <h2>The month in figures</h2>
          <span className="rule" aria-hidden />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fig label="Own commissionable revenue" value={formatMoney(Number(s.product_revenue))} />
          <Fig
            label="Group sales"
            value={formatMoney(Number(s.group_revenue))}
            note="Own plus the whole downline. A sales figure — the margin penalty does not reduce it."
          />
          <Fig
            label="Held by the deposit gate"
            value={formatMoney(Number(s.deferred_revenue))}
            note="Pays in the month the deposit clears."
            warn={Number(s.deferred_revenue) > 0}
          />
          <Fig
            label="Not commissionable"
            value={formatMoney(Number(s.excluded_revenue))}
            note="Transport, disposal and anything in an unclassified item group."
          />
          <Fig
            label="Penalty-weighted revenue"
            value={formatMoney(Number(s.penalty_weighted_revenue))}
            note="What the upline overrides on, so a bill cut for margin cuts the override too."
          />
          <Fig label="KPI units" value={Number(s.kpi_qty).toLocaleString()} />
          <Fig
            label="KPI base"
            value={formatMoney(Number(s.kpi_base))}
            note={
              Number(s.kpi_threshold_pct) > 0
                ? `Uplifted ${pct(s.kpi_threshold_pct, 0)} for clearing the quantity ladder.`
                : undefined
            }
          />
          <Fig
            label="Commission withheld for margin"
            value={formatMoney(withheld)}
            note="Memo — the lines below are already net of it."
            warn={withheld > 0}
          />
        </div>
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
          <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
            The incentive is the highest tier that <em>every</em> brand they sold clears — three
            weekends of one brand at Tier 2 and a fourth of another below it is a Tier 1 month. A
            brand with no cost data, or no ladder, blocks the incentive entirely rather than paying
            on the ones that can be judged.
          </p>
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
                    <td className="font-mono text-[11px] text-graphite">{b.brand_code}</td>
                    <td className="num">{formatMoney(Number(b.revenue))}</td>
                    <td className="num">{formatMoney(Number(b.cost))}</td>
                    <td className={b.margin_pct === null ? 'num neg' : 'num'}>
                      {b.margin_pct === null ? 'no cost' : pct(b.margin_pct)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <em className="font-serif text-ink text-sm">All brands</em>
                  </td>
                  <td className="num">{formatMoney(Number(s.margin_revenue))}</td>
                  <td className="num">{formatMoney(Number(s.margin_cost))}</td>
                  <td className={s.margin_pct === null ? 'num neg' : 'num'}>
                    {s.margin_pct === null ? 'no cost' : pct(s.margin_pct)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {byComponent.map(group => (
        <section key={group.component} className="mb-10">
          <div className="sect-head">
            <h2>{COMPONENT_LABEL[group.component] ?? group.component}</h2>
            <span className="rule" aria-hidden />
            <span className="count">{formatMoney(group.subtotal)}</span>
          </div>
          {COMPONENT_NOTE[group.component] ? (
            <p className="font-serif italic text-muted text-sm mb-4 max-w-3xl">
              {COMPONENT_NOTE[group.component]}
            </p>
          ) : null}
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
                      <div className="font-serif text-[14px] text-ink">
                        {l.source_staff_id
                          ? (staff.get(l.source_staff_id)?.employee_name ?? l.source_staff_id)
                          : (l.note ?? '—')}
                      </div>
                      {l.source_staff_id && l.note ? (
                        <div className="font-mono text-[10.5px] text-graphite mt-0.5">{l.note}</div>
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
              <tr>
                <td>
                  <strong className="font-serif text-ink text-[15px]">
                    Into {label(period)} payroll
                  </strong>
                </td>
                <td className="num font-semibold text-lg">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="font-serif italic text-muted text-xs mt-3 max-w-3xl">
          This figure lands in <strong>hr_monthly_payroll.commission_amount</strong> and nothing
          else. A Revenue salesperson has no basic and no statutory allowance, so it becomes their
          whole gross; Withholding Tax, where it applies, comes off in payroll.
        </p>
      </section>
    </div>
  )
}

function Fig({
  label: text,
  value,
  note,
  warn,
}: {
  label: string
  value: string
  note?: string
  warn?: boolean
}) {
  return (
    <div className="border border-hairline rounded-card bg-surface px-4 py-3">
      <div className="font-mono text-[0.6rem] tracking-wide text-muted uppercase mb-1">{text}</div>
      <div
        className={[
          'num tabular tracking-[-0.01em] text-xl',
          warn ? 'text-danger' : 'text-num-ink',
        ].join(' ')}
      >
        {value}
      </div>
      {note ? <div className="font-serif italic text-muted text-xs mt-1.5">{note}</div> : null}
    </div>
  )
}

function Sum({ name, value }: { name: string; value: number }) {
  return (
    <tr>
      <td>
        <span className="font-serif text-[14px] text-graphite">{name}</span>
      </td>
      <td className="num">{formatMoney(value)}</td>
    </tr>
  )
}
