import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import Link from 'next/link'
import CTCInputGrid from './_components/CTCInputGrid'
import ConfirmPayoutsButton from './_components/ConfirmPayoutsButton'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function DirectorSalaryPage({ searchParams }: Props) {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')

  const [
    { data: directors },
    { data: companies },
    { data: ctcRows },
    { data: payouts },
    { data: payoutSummary },
  ] = await Promise.all([
    supabase.from('directors').select('id, name, code, weightage, min_payout').eq('status', 'active').order('code'),
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('director_ctc').select('*').eq('period_month', period),
    supabase.from('director_payouts').select('*').eq('period_month', period).order('gross_amount', { ascending: false }),
    supabase.rpc('get_director_payout_summary', { p_period: period }),
  ])

  const hasPayouts = (payouts?.length ?? 0) > 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (payoutSummary as any)?.[0] ?? null
  const hasSummaryData = summary && summary.out_payout_count > 0

  return (
    <div>
      {/* Header */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · SALARY ENGINE
          </div>
          <h1 className="page-title">Director Salary</h1>
        </div>
        <div className="flex items-center gap-3">
          <label className="font-sans text-xs uppercase tracking-wide text-muted">Period</label>
          <form>
            <input
              type="month"
              name="period"
              defaultValue={dayjs(period).format('YYYY-MM')}
              className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
            />
          </form>
        </div>
      </div>

      {/* Hero section — Pool summary */}
      {(hasPayouts || hasSummaryData) && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
          <div className="lg:col-span-7">
            <div className="font-serif italic text-accent text-base mb-1">
              Salary Pool — {periodLabel}
            </div>
            <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tabular tracking-[-0.01em]">
              {formatMoney(Number(summary.out_pool_total ?? 0))}
            </div>
            <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
              {summary.out_payout_count} DIRECTORS ·{' '}
              <em className={`font-serif text-sm not-italic ${
                summary.out_status === 'draft' ? 'text-alert' :
                summary.out_status === 'confirmed' ? 'text-ledger' : 'text-graphite'
              }`}>
                {summary.out_status.toUpperCase()}
              </em>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Total Payroll (75%)</span>
              <span className="font-mono tabular text-sm font-medium text-num-ink">{formatMoney(Number(summary.out_total_payroll_gross))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Total Invoice (25%)</span>
              <span className="font-mono tabular text-sm font-medium text-num-ink">{formatMoney(Number(summary.out_total_invoice))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Total 5% Saving</span>
              <span className="font-mono tabular text-sm font-medium text-ledger">{formatMoney(Number(summary.out_total_saving))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Total Advance</span>
              <span className="font-mono tabular text-sm font-medium text-alert">{formatMoney(Number(summary.out_total_advance))}</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-hairline">
              <span className="font-serif italic text-sm text-graphite">Net to Directors</span>
              <span className="font-mono tabular text-md font-medium text-num-ink font-semibold">{formatMoney(Number(summary.out_total_payroll_net))}</span>
            </div>
          </div>
        </div>
      )}

      {/* CTC Input Section */}
      <section className="mb-16">
            <h2 className="font-serif text-2xl text-ink mb-1">CTC Input</h2>

            <CTCInputGrid
              directors={(directors ?? []).map(d => ({
                id: d.id,
                code: d.code,
                name: d.name ?? d.code,
              }))}
              companies={(companies ?? []).map(c => ({
                id: c.id,
                name: c.name,
                short_code: c.short_code,
              }))}
              existingCTC={(ctcRows ?? []).map(r => ({
                director_id: r.director_id,
                company_id: r.company_id,
                basic: Number(r.basic),
                kpi: Number(r.kpi),
                allowance: Number(r.allowance),
                employer_epf: r.employer_epf ? Number(r.employer_epf) : null,
                employer_socso: r.employer_socso ? Number(r.employer_socso) : null,
                employer_eis: r.employer_eis ? Number(r.employer_eis) : null,
                total_ctc: r.total_ctc ? Number(r.total_ctc) : null,
              }))}
              period={period}
            />
          </section>

          {/* Per-Director Payouts Table */}
          {hasPayouts && (
            <section className="mb-16">
              <div className="flex items-baseline justify-between mb-6">
                <div>
                  <h2 className="font-serif text-2xl text-ink mb-1">Per-Director Payouts</h2>
                </div>
                <ConfirmPayoutsButton
                  period={period}
                  draftCount={payouts?.filter(p => p.status === 'draft').length ?? 0}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Director</th>
                      <th className="right">Gross</th>
                      <th className="right">Saving</th>
                      <th className="right">Payroll (75%)</th>
                      <th className="right">Invoice (25%)</th>
                      <th className="right">Net</th>
                      <th className="right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts?.map(p => {
                      const dir = directors?.find(d => d.id === p.director_id)
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="font-serif text-[15px] text-ink">{dir?.code ?? '?'}</div>
                            <div className="font-mono text-[11px] text-graphite mt-0.5">{dir?.name}</div>
                          </td>
                          <td className="num">{formatMoney(p.gross_amount ?? 0)}</td>
                          <td className="num neg">{formatMoney(-(p.saving_amount ?? 0))}</td>
                          <td className="num">{formatMoney(p.payroll_gross ?? 0)}</td>
                          <td className="num">{formatMoney(p.invoice_total ?? 0)}</td>
                          <td className="num font-semibold">{formatMoney(p.payroll_net ?? 0)}</td>
                          <td className="right">
                            <Link
                              href={`/director-salary/${p.director_id}?period=${period}`}
                              className="text-sm text-accent hover:text-accent-hover font-serif italic"
                            >
                              Detail
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
    </div>
  )
}
