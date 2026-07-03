import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, formatMoneyBare, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import Link from 'next/link'
import PCBInput from './_components/PCBInput'
import EditableDeduction from './_components/EditableDeduction'
import ResetStatutoryButton from './_components/ResetStatutoryButton'

interface Props {
  params: Promise<{ directorId: string }>
  searchParams: Promise<{ period?: string }>
}

export default async function PayoutDetailPage({ params, searchParams }: Props) {
  const user = await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const { directorId } = await params
  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')

  const [
    { data: director },
    { data: payout },
  ] = await Promise.all([
    supabase.from('directors').select('*').eq('id', directorId).single(),
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
      <div className="py-16 text-center">
        <p className="font-serif italic text-danger">Director not found.</p>
      </div>
    )
  }

  if (!payout) {
    return (
      <div>
        <Link href={`/director-salary?period=${period}`} className="text-sm text-muted hover:text-accent font-sans transition-colors">
          ← Back to Director Salary
        </Link>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">
              <em>I.</em> DIRECTOR · PAYOUT · {periodLabel.toUpperCase()}
            </div>
            <h1 className="page-title">Director {director.code}</h1>
            <p className="font-serif italic text-graphite text-base mt-3">
              <em>Payout not yet calculated for this period.</em>
            </p>
          </div>
        </div>
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-1">
            尚未计算。
          </p>
          <p className="font-serif italic text-muted text-sm">
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
    ? dayjs(payout.statutory_overridden_at).format('D MMM YYYY HH:mm')
    : ''

  return (
    <div>
      <Link href={`/director-salary?period=${period}`} className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Director Salary
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · PAYOUT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">{director.name} — {director.code}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Payout detail. <em className={`font-serif text-sm ${
              payout.status === 'draft' ? 'text-alert' :
              payout.status === 'confirmed' ? 'text-ledger' : 'text-graphite'
            }`}>{payout.status}</em>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column — Calculation summary */}
        <div className="space-y-6">
          {/* Gross + Saving */}
          <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Gross Allocation</span>
              <span className="num text-num-ink font-semibold">{formatMoney(n(payout.gross_amount))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">5% Saving</span>
              <span className="num neg">({formatMoneyBare(n(payout.saving_amount))})</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="font-serif italic text-sm text-accent">After Saving</span>
              <span className="num text-num-ink">{formatMoney(n(payout.after_saving))}</span>
            </div>
          </div>

          {/* 75% Payroll */}
          <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
            <h3 className="font-serif italic text-ink text-md mb-2">75% Payroll</h3>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Calculated (75%)</span>
              <span className="num text-graphite">{formatMoney(n(payout.payroll_calc))}</span>
            </div>
            {n(payout.advance_amount) > 0 && (
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-alert">Advance (below min RM {formatMoneyBare(director.min_payout)})</span>
                <span className="num text-alert">+{formatMoneyBare(n(payout.advance_amount))}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="font-serif italic text-sm text-accent">Payroll Gross</span>
              <span className="num text-num-ink font-semibold">{formatMoney(n(payout.payroll_gross))}</span>
            </div>

            {/* Phase 11.2: Earnings breakdown — display only, sums to payroll_gross */}
            <div className="pt-3 border-t border-hairline space-y-2">
              <p className="font-sans text-xs uppercase tracking-wide text-graphite">Earnings breakdown</p>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">Basic <span className="text-muted">(min RM {formatMoneyBare(minPayout)})</span></span>
                <span className="num text-num-ink">{formatMoney(basicLine)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">KPI <span className="text-muted">(EPF-able)</span></span>
                <span className="num text-num-ink">{formatMoney(kpiLine)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">Allowance <span className="text-muted">(non-EPF)</span></span>
                <span className="num text-num-ink">{formatMoney(allowanceLine)}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-hairline space-y-2">
              <p className="font-sans text-xs uppercase tracking-wide text-graphite">Deductions <span className="text-muted normal-case font-serif italic">— click any value to override</span></p>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">EPF ER</span>
                <EditableDeduction payoutId={payout.id} field="payroll_epf_er" value={n(payout.payroll_epf_er)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">EPF EE</span>
                <EditableDeduction payoutId={payout.id} field="payroll_epf_ee" value={n(payout.payroll_epf_ee)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">SOCSO ER</span>
                <EditableDeduction payoutId={payout.id} field="payroll_socso_er" value={n(payout.payroll_socso_er)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">SOCSO EE</span>
                <EditableDeduction payoutId={payout.id} field="payroll_socso_ee" value={n(payout.payroll_socso_ee)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">EIS ER</span>
                <EditableDeduction payoutId={payout.id} field="payroll_eis_er" value={n(payout.payroll_eis_er)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">EIS EE</span>
                <EditableDeduction payoutId={payout.id} field="payroll_eis_ee" value={n(payout.payroll_eis_ee)} kind="payroll" readOnly={payout.status !== 'draft'} />
              </div>
              <div className="flex items-baseline justify-between">
                <span className="font-serif italic text-sm text-graphite">SKBBK <span className="text-muted">(EE, net-only)</span></span>
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
          <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
            <h3 className="font-serif italic text-ink text-md mb-2">25% Invoice</h3>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Base</span>
              <span className="num">{formatMoney(n(payout.invoice_base))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">+ EPF ER</span>
              <EditableDeduction payoutId={payout.id} field="invoice_epf_er" value={n(payout.invoice_epf_er)} kind="invoice" readOnly={payout.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">+ SOCSO ER</span>
              <EditableDeduction payoutId={payout.id} field="invoice_socso_er" value={n(payout.invoice_socso_er)} kind="invoice" readOnly={payout.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">+ EIS ER</span>
              <EditableDeduction payoutId={payout.id} field="invoice_eis_er" value={n(payout.invoice_eis_er)} kind="invoice" readOnly={payout.status !== 'draft'} />
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="font-serif italic text-sm text-accent">Invoice Total</span>
              <span className="num text-num-ink font-semibold">{formatMoney(n(payout.invoice_total))}</span>
            </div>
          </div>

          {/* Statutory Surplus */}
          <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
            <h3 className="font-serif italic text-ink text-md mb-2">Statutory Surplus</h3>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">ER IN (share)</span>
              <span className="num">{formatMoney(n(payout.statutory_er_in))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">ER OUT (75%+25%)</span>
              <span className="num">{formatMoney(n(payout.statutory_er_out))}</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="font-serif italic text-sm text-accent">Surplus</span>
              <span className={`num font-semibold ${n(payout.statutory_surplus) >= 0 ? 'text-ledger' : 'neg'}`}>
                {formatMoney(n(payout.statutory_surplus))}
              </span>
            </div>
          </div>

          {/* Advance Tracking */}
          <div className="border border-hairline rounded-md bg-surface p-5 space-y-3">
            <h3 className="font-serif italic text-ink text-md mb-2">Advance Tracking</h3>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">This month advance</span>
              <span className="num text-alert">
                {n(payout.advance_amount) > 0 ? `+${formatMoneyBare(n(payout.advance_amount))}` : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Repaid</span>
              <span className="num text-ledger">
                {n(payout.advance_repaid) > 0 ? `-${formatMoneyBare(n(payout.advance_repaid))}` : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="font-serif italic text-sm text-accent">Balance</span>
              <span className="num text-num-ink font-semibold">{formatMoney(n(payout.advance_balance))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
