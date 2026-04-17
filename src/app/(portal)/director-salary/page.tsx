import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { canSeeIndividualSalary } from '@/lib/roles'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import Link from 'next/link'
import CTCInputGrid from './_components/CTCInputGrid'
import ConfirmPayoutsButton from './_components/ConfirmPayoutsButton'
import DirectorPinGate from '@/components/DirectorPinGate'
import { isDirectorPinVerified } from './pin-actions'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function DirectorSalaryPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'hr', 'finance'])

  // Finance needs PIN verification to access Director section
  if (user.role === 'finance') {
    const verified = await isDirectorPinVerified()
    if (!verified) {
      return <DirectorPinGate verified={false}><div /></DirectorPinGate>
    }
  }
  const supabase = await createClient()

  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')

  const isHROrPrincipal = canSeeIndividualSalary(user.role)

  // Fetch data in parallel
  const [
    { data: directors },
    { data: companies },
    { data: ctcRows },
    { data: payouts },
    { data: financeSummary },
  ] = await Promise.all([
    supabase.from('directors').select('id, name, code, weightage, min_payout').eq('status', 'active').order('code'),
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    isHROrPrincipal
      ? supabase.from('director_ctc').select('*').eq('period_month', period)
      : Promise.resolve({ data: [] as never[] }),
    isHROrPrincipal
      ? supabase.from('director_payouts').select('*').eq('period_month', period).order('gross_amount', { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    supabase.rpc('get_director_payout_summary', { p_period: period }),
  ])

  const hasPayouts = (payouts?.length ?? 0) > 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (financeSummary as any)?.[0] ?? null
  // Finance doesn't fetch payouts directly — use summary count instead
  const hasSummaryData = summary && summary.out_payout_count > 0

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Director Salary</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            月度薪水计算引擎。<em>CTC → Pool → Weightage → Payout.</em>
          </p>
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
            <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
              {formatMoney(Number(summary.out_pool_total ?? 0))}
            </div>
            <div className="font-mono text-xs text-muted mt-2">
              {summary.out_payout_count} directors ·{' '}
              <em className={`font-serif text-sm ${
                summary.out_status === 'draft' ? 'text-alert' :
                summary.out_status === 'confirmed' ? 'text-ledger' : 'text-graphite'
              }`}>
                {summary.out_status}
              </em>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Total Payroll (75%)</span>
              <span className="font-mono tabular text-sm font-medium text-ink">{formatMoney(Number(summary.out_total_payroll_gross))}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif italic text-sm text-graphite">Total Invoice (25%)</span>
              <span className="font-mono tabular text-sm font-medium text-ink">{formatMoney(Number(summary.out_total_invoice))}</span>
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
              <span className="font-mono tabular text-md font-medium text-ink font-semibold">{formatMoney(Number(summary.out_total_payroll_net))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Finance view — lump sum only */}
      {!isHROrPrincipal && (
        <div>
          {(!hasSummaryData) && (
            <div className="py-16 text-center border border-hairline rounded-md bg-surface">
              <p className="font-serif italic text-graphite text-lg mb-1">
                本月尚未提交 Director Salary。
              </p>
              <p className="font-serif italic text-muted text-sm">
                HR 计算完成后会在这里显示汇总数据。
              </p>
            </div>
          )}

          {hasSummaryData && summary && (
            <section className="mb-16">
              <h2 className="font-serif text-2xl text-ink mb-1">Statutory Remittance</h2>
              <p className="font-serif italic text-graphite text-sm mb-6">法定扣款汇总。</p>

              <div className="border border-hairline rounded-md bg-surface p-5 space-y-3 max-w-xl">
                <div className="flex items-baseline justify-between">
                  <span className="font-serif italic text-sm text-graphite">EPF (ER+EE)</span>
                  <span className="font-mono tabular text-sm font-medium text-ink">
                    {formatMoney(Number(summary.out_total_epf_er) + Number(summary.out_total_epf_ee))}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-serif italic text-sm text-graphite">SOCSO (ER+EE)</span>
                  <span className="font-mono tabular text-sm font-medium text-ink">
                    {formatMoney(Number(summary.out_total_socso_er) + Number(summary.out_total_socso_ee))}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-serif italic text-sm text-graphite">EIS (ER+EE)</span>
                  <span className="font-mono tabular text-sm font-medium text-ink">
                    {formatMoney(Number(summary.out_total_eis_er) + Number(summary.out_total_eis_ee))}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-serif italic text-sm text-graphite">PCB</span>
                  <span className="font-mono tabular text-sm font-medium text-ink">
                    {formatMoney(Number(summary.out_total_pcb))}
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {/* HR / Principal view — CTC input + calculation */}
      {isHROrPrincipal && (
        <>
          {/* CTC Input Section */}
          <section className="mb-16">
            <h2 className="font-serif text-2xl text-ink mb-1">CTC Input</h2>
            <p className="font-serif italic text-graphite text-sm mb-6">
              录入每间子公司的 Director Portion。<em>Save & Calculate 会同时存 CTC 并立刻重算所有 draft payout。</em>
            </p>

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
                  <p className="font-serif italic text-graphite text-sm">
                    点击 Director 查看完整明细。
                  </p>
                </div>
                <ConfirmPayoutsButton
                  period={period}
                  draftCount={payouts?.filter(p => p.status === 'draft').length ?? 0}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                      <th className="text-left py-3 pr-4 font-medium">Director</th>
                      <th className="text-right py-3 pr-4 font-medium">Gross</th>
                      <th className="text-right py-3 pr-4 font-medium">Saving</th>
                      <th className="text-right py-3 pr-4 font-medium">Payroll (75%)</th>
                      <th className="text-right py-3 pr-4 font-medium">Invoice (25%)</th>
                      <th className="text-right py-3 pr-4 font-medium">Net</th>
                      <th className="py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts?.map(p => {
                      const dir = directors?.find(d => d.id === p.director_id)
                      return (
                        <tr key={p.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                          <td className="py-4 pr-4">
                            <div className="font-serif text-md text-ink">{dir?.code ?? '?'}</div>
                            <div className="font-mono text-xs text-muted">{dir?.name}</div>
                          </td>
                          <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">{formatMoney(p.gross_amount ?? 0)}</td>
                          <td className="py-4 pr-4 text-right font-mono tabular font-medium text-danger">{formatMoney(-(p.saving_amount ?? 0))}</td>
                          <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">{formatMoney(p.payroll_gross ?? 0)}</td>
                          <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">{formatMoney(p.invoice_total ?? 0)}</td>
                          <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">{formatMoney(p.payroll_net ?? 0)}</td>
                          <td className="py-4 text-right">
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
        </>
      )}
    </div>
  )
}
