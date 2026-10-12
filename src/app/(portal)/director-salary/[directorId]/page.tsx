import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { formatMoney, formatMoneyBare, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import Link from 'next/link'
import PCBInput from './_components/PCBInput'
import EditableDeduction from './_components/EditableDeduction'
import ResetStatutoryButton from './_components/ResetStatutoryButton'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { DIRECTOR_ROW_COLUMNS } from '@/lib/private-columns'

interface Props {
  params: Promise<{ directorId: string }>
  searchParams: Promise<{ period?: string }>
}

export default async function PayoutDetailPage({ params, searchParams }: Props) {
  await requirePage('/director-salary/[directorId]')
  const user = await requirePermission('director_salary')
  const supabase = await createClient()

  const { directorId } = await params
  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')

  const [
    { data: director },
    { data: payout },
  ] = await Promise.all([
    supabase.from('directors').select(DIRECTOR_ROW_COLUMNS).eq('id', directorId).single(),
    supabase.from('director_payouts').select('*').eq('director_id', directorId).eq('period_month', period).maybeSingle(),
  ])

  // Fire-and-forget access log for sensitive director data
  void supabase.rpc('log_data_access', {
    p_resource_type: 'director_payouts',
    p_resource_id: directorId,
    p_action: 'view',
    p_metadata: { period },
  })

  if (!director) {
    return (
      <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
        <p className="text-sm text-danger">Director not found.</p>
      </div>
    )
  }

  if (!payout) {
    return (
      <div>
        <Link href={`/director-salary?period=${period}`} className="inline-block mb-3 text-sm hover:text-accent transition-colors">
          ← Back to Director Salary
        </Link>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> DIRECTOR · PAYOUT · {periodLabel.toUpperCase()}
            </div>
            <h1 className="page-title">Director {director.code}</h1>
          </div>
        </div>
        <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
          <p className="text-md font-medium mb-1">
            尚未计算。
          </p>
          <p className="text-sm">
            先在主页触发计算。
          </p>
        </div>
      </div>
    )
  }

  // PCB auto-suggest lookup
  const taxableIncome = Number(payout.payroll_gross ?? 0) - Number(payout.payroll_epf_ee ?? 0)
  const { data: suggestedPcb } = await supabase.rpc('lookup_pcb', {
    p_income: taxableIncome,
    p_category: director.pcb_category,
    p_children: director.children_count,
  })

  const totalDeductions = Number(payout.payroll_epf_er ?? 0) + Number(payout.payroll_epf_ee ?? 0)
    + Number(payout.payroll_socso_er ?? 0) + Number(payout.payroll_socso_ee ?? 0)
    + Number(payout.payroll_eis_er ?? 0) + Number(payout.payroll_eis_ee ?? 0)
    + Number(payout.payroll_skbbk ?? 0)

  const n = (v: number | null) => Number(v ?? 0)

  // Phase 11.2: payslip earnings breakdown.
  // Use payroll_bk + payroll_allow stored on the row (already accounts for
  // post-offset ratios + advance top-up). Loo's spec:
  //   Basic = min_payout floor (always show 14,400 if BK >= floor)
  //   KPI   = BK portion - floor (the EPF-able balance above 14,400)
  //   Allowance = non-EPF portion of gross
  // Sum = payroll_bk + payroll_allow = payroll_gross
  const minPayout = Number(director.min_payout ?? 14400)
  const bkPortion = n(payout.payroll_bk)
  const allowancePortion = n(payout.payroll_allow)
  const basicLine = Math.min(minPayout, bkPortion)
  const kpiLine = Math.max(0, bkPortion - minPayout)
  const allowanceLine = allowancePortion
  const isOverridden = !!payout.statutory_overridden_at
  const overriddenLabel = payout.statutory_overridden_at
    ? officeTime(payout.statutory_overridden_at).format('D MMM YYYY HH:mm')
    : ''

  const statusChip =
    payout.status === 'draft' ? 'alert' : payout.status === 'confirmed' ? 'ledger' : ''
  const surplus = n(payout.statutory_surplus)

  return (
    <div>
      <Link href={`/director-salary?period=${period}`} className="inline-block mb-3 text-sm hover:text-accent transition-colors">
        ← Back to Director Salary
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · PAYOUT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">{director.name} — {director.code}</h1>
          <p className="text-sm mt-3 flex flex-wrap items-center gap-2">
            <span className={`chip ${statusChip}`}><span className="dot" />{payout.status}</span>
          </p>
        </div>
        <Link
          href={`/director-salary/${directorId}/print?period=${period}`}
          target="_blank"
          className="btn-secondary"
        >
          Print Statement
        </Link>
      </div>

      {/* The payout in six figures, read off the cards below. Net to director
          is what the page is opened for — the walnut card; the stored figure,
          so it moves when Save PCB or a deduction override lands. */}
      <StatCards label={`Payout for ${director.code}, ${periodLabel}`}>
        <StatCard
          label="Gross allocation"
          value={formatMoney(n(payout.gross_amount))}
          icon="coin"
          note={`After saving ${formatMoney(n(payout.after_saving))}`}
        />
        <StatCard label="Payroll gross (75%)" value={formatMoney(n(payout.payroll_gross))} icon="wallet" />
        <StatCard
          label="Net to director"
          value={formatMoney(n(payout.payroll_net))}
          icon="bank"
          tone="primary"
          note={`After PCB ${formatMoney(n(payout.payroll_pcb))}`}
        />
        <StatCard label="Invoice total (25%)" value={formatMoney(n(payout.invoice_total))} icon="receipt" note="Base + employer statutory" />
        <StatCard
          label="Statutory surplus"
          value={formatMoney(surplus)}
          icon="shield"
          tone={surplus >= 0 ? 'ledger' : 'danger'}
          note="ER in − ER out"
        />
        <StatCard label="Advance balance" value={formatMoney(n(payout.advance_balance))} icon="clock" />
      </StatCards>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column — Calculation summary */}
        <div className="space-y-6">
          {/* Gross + Saving */}
          <div className="border border-hairline rounded-card bg-surface p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm">Gross Allocation</span>
              <span className="num font-semibold">{formatMoney(n(payout.gross_amount))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">5% Saving</span>
              <span className="num neg">({formatMoneyBare(n(payout.saving_amount))})</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="text-sm font-semibold">After Saving</span>
              <span className="num">{formatMoney(n(payout.after_saving))}</span>
            </div>
          </div>

          {/* 75% Payroll */}
          <div className="border border-hairline rounded-card bg-surface p-5 space-y-3">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] mb-2">75% Payroll</h3>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">Calculated (75%)</span>
              <span className="num">{formatMoney(n(payout.payroll_calc))}</span>
            </div>
            {n(payout.advance_amount) > 0 && (
              <div className="flex items-baseline justify-between">
                <span className="text-sm">Advance <span className="text-xs">(below min RM {formatMoneyBare(director.min_payout)})</span></span>
                <span className="num text-alert">+{formatMoneyBare(n(payout.advance_amount))}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="text-sm font-semibold">Payroll Gross</span>
              <span className="num font-semibold">{formatMoney(n(payout.payroll_gross))}</span>
            </div>

            {/* Phase 11.2: Earnings breakdown — display only, sums to payroll_gross */}
            <div className="pt-3 border-t border-hairline space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em]">Earnings breakdown</p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">Basic <span className="text-xs">(min RM {formatMoneyBare(minPayout)})</span></span>
                <span className="num">{formatMoney(basicLine)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">KPI <span className="text-xs">(EPF-able)</span></span>
                <span className="num">{formatMoney(kpiLine)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">Allowance <span className="text-xs">(non-EPF)</span></span>
                <span className="num">{formatMoney(allowanceLine)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-hairline space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.06em]">Deductions</p>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">EPF ER</span>
                <EditableDeduction payoutId={payout.id} field="payroll_epf_er" value={n(payout.payroll_epf_er)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">EPF EE</span>
                <EditableDeduction payoutId={payout.id} field="payroll_epf_ee" value={n(payout.payroll_epf_ee)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">SOCSO ER</span>
                <EditableDeduction payoutId={payout.id} field="payroll_socso_er" value={n(payout.payroll_socso_er)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">SOCSO EE</span>
                <EditableDeduction payoutId={payout.id} field="payroll_socso_ee" value={n(payout.payroll_socso_ee)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">EIS ER</span>
                <EditableDeduction payoutId={payout.id} field="payroll_eis_er" value={n(payout.payroll_eis_er)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">EIS EE</span>
                <EditableDeduction payoutId={payout.id} field="payroll_eis_ee" value={n(payout.payroll_eis_ee)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm">SKBBK <span className="text-xs">(EE, net-only)</span></span>
                <EditableDeduction payoutId={payout.id} field="payroll_skbbk" value={n(payout.payroll_skbbk)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              {payout.status === 'draft' && isOverridden ? (
                <div className="pt-2">
                  <ResetStatutoryButton payoutId={payout.id} overridden={isOverridden} overriddenLabel={overriddenLabel} />
                </div>
              ) : null}
            </div>

            {/* PCB Input */}
            <div className="pt-3 border-t border-hairline">
              <PCBInput
                payoutId={payout.id}
                currentPcb={n(payout.payroll_pcb)}
                suggestedPcb={suggestedPcb ?? 0}
                payrollGross={n(payout.payroll_gross)}
                totalDeductions={totalDeductions}
              />
            </div>
          </div>
        </div>

        {/* Right column — Invoice + Surplus + Advance */}
        <div className="space-y-6">
          {/* 25% Invoice */}
          <div className="border border-hairline rounded-card bg-surface p-5 space-y-3">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] mb-2">25% Invoice</h3>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">Base</span>
              <span className="num">{formatMoney(n(payout.invoice_base))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">+ EPF ER</span>
              <EditableDeduction payoutId={payout.id} field="invoice_epf_er" value={n(payout.invoice_epf_er)} kind="invoice" readOnly={payout.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">+ SOCSO ER</span>
              <EditableDeduction payoutId={payout.id} field="invoice_socso_er" value={n(payout.invoice_socso_er)} kind="invoice" readOnly={payout.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">+ EIS ER</span>
              <EditableDeduction payoutId={payout.id} field="invoice_eis_er" value={n(payout.invoice_eis_er)} kind="invoice" readOnly={payout.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="text-sm font-semibold">Invoice Total</span>
              <span className="num font-semibold">{formatMoney(n(payout.invoice_total))}</span>
            </div>
          </div>

          {/* Statutory Surplus */}
          <div className="border border-hairline rounded-card bg-surface p-5 space-y-3">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] mb-2">Statutory Surplus</h3>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">ER IN (share)</span>
              <span className="num">{formatMoney(n(payout.statutory_er_in))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">ER OUT (75%+25%)</span>
              <span className="num">{formatMoney(n(payout.statutory_er_out))}</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="text-sm font-semibold">Surplus</span>
              <span className={`num font-semibold ${surplus >= 0 ? 'text-ledger' : 'neg'}`}>
                {formatMoney(surplus)}
              </span>
            </div>
          </div>

          {/* Advance Tracking */}
          <div className="border border-hairline rounded-card bg-surface p-5 space-y-3">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] mb-2">Advance Tracking</h3>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">This month advance</span>
              <span className="num text-alert">
                {n(payout.advance_amount) > 0 ? `+${formatMoneyBare(n(payout.advance_amount))}` : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm">Repaid</span>
              <span className="num text-ledger">
                {n(payout.advance_repaid) > 0 ? `-${formatMoneyBare(n(payout.advance_repaid))}` : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="text-sm font-semibold">Balance</span>
              <span className="num font-semibold">{formatMoney(n(payout.advance_balance))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
