import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import Link from 'next/link'
import CTCInputGrid from './_components/CTCInputGrid'
import SubmitDirectorSalaryButton from './_components/SubmitDirectorSalaryButton'
import ReopenDirectorSalaryButton from './_components/ReopenDirectorSalaryButton'

interface Props {
  searchParams: Promise<{ period?: string; tab?: string }>
}

interface ByCompanyRow {
  company_id: string
  company_name: string
  company_short_code: string
  total_ctc: number
}

export default async function DirectorSalaryPage({ searchParams }: Props) {
  await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const { period: rawPeriod, tab: rawTab } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')
  const tab = rawTab === 'submission' ? 'submission' : 'calculation'

  const [
    { data: directors },
    { data: companies },
    { data: ctcRows },
    { data: payouts },
    { data: payoutSummary },
    { data: submission },
    { data: liveByCompany },
  ] = await Promise.all([
    supabase.from('directors').select('id, name, code, weightage, min_payout').eq('status', 'active').order('code'),
    supabase.from('companies').select('id, name, short_code').eq('is_active', true).order('name'),
    supabase.from('director_ctc').select('*').eq('period_month', period),
    supabase.from('director_payouts').select('*').eq('period_month', period).order('gross_amount', { ascending: false }),
    supabase.rpc('get_director_payout_summary', { p_period: period }),
    supabase
      .from('director_salary_submissions')
      .select('*')
      .eq('period_month', period)
      .maybeSingle(),
    supabase.rpc('get_director_ctc_by_company', { p_period_month: period }),
  ])

  const hasPayouts = (payouts?.length ?? 0) > 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (payoutSummary as any)?.[0] ?? null
  const hasSummaryData = summary && summary.out_payout_count > 0

  const tabHref = (t: 'calculation' | 'submission') =>
    `/director-salary?period=${dayjs(period).format('YYYY-MM')}${t === 'submission' ? '&tab=submission' : ''}`

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
            {tab === 'submission' && <input type="hidden" name="tab" value="submission" />}
          </form>
        </div>
      </div>

      {/* Tabs — Calculation | Director Payroll Submission */}
      <div className="flex items-center gap-6 border-b border-hairline mb-10">
        <TabLink href={tabHref('calculation')} active={tab === 'calculation'}>
          Calculation
        </TabLink>
        <TabLink href={tabHref('submission')} active={tab === 'submission'}>
          Director Payroll Submission
          {submission ? (
            <span className="ml-2 font-mono text-[10px] text-ledger uppercase tracking-wider">submitted</span>
          ) : null}
        </TabLink>
      </div>

      {tab === 'calculation' ? (
        <>
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
                <Link
                  href={tabHref('submission')}
                  className="font-serif italic text-sm text-accent hover:text-accent-hover"
                >
                  {submission ? 'View submission →' : 'Submit to Finance →'}
                </Link>
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
        </>
      ) : (
        <SubmissionTab
          period={period}
          periodLabel={periodLabel}
          submission={submission}
          hasPayouts={hasPayouts}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          summary={summary as any}
          liveByCompany={((liveByCompany as ByCompanyRow[] | null) ?? []).map(r => ({
            ...r,
            total_ctc: Number(r.total_ctc),
          }))}
        />
      )}
    </div>
  )
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'font-serif italic text-base text-ink border-b-2 border-accent pb-2 -mb-px'
          : 'font-serif italic text-base text-graphite hover:text-ink border-b-2 border-transparent pb-2 -mb-px transition-colors'
      }
    >
      {children}
    </Link>
  )
}

// ─── Director Payroll Submission tab ─────────────────────────────────────────
// Transparency rule: every total the submit RPC writes is shown by-source on
// this page BEFORE submitting (payout totals from director_payouts, the
// per-subsidiary split from director_ctc). Missing source → disabled button.
function SubmissionTab({
  period,
  periodLabel,
  submission,
  hasPayouts,
  summary,
  liveByCompany,
}: {
  period: string
  periodLabel: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submission: any
  hasPayouts: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any
  liveByCompany: ByCompanyRow[]
}) {
  const submitted = !!submission

  // Submitted → render the snapshot; not yet → live preview of what would be
  // submitted right now.
  const byCompany: ByCompanyRow[] = submitted
    ? ((submission.by_company as ByCompanyRow[] | null) ?? []).map(r => ({
        ...r,
        total_ctc: Number(r.total_ctc),
      }))
    : liveByCompany
  const byCompanyTotal = byCompany.reduce((s, r) => s + r.total_ctc, 0)

  const totals = submitted
    ? {
        gross: Number(submission.total_gross),
        payrollGross: Number(submission.total_payroll_gross),
        payrollNet: Number(submission.total_payroll_net),
        statutoryEr: Number(submission.total_statutory_er),
        invoice: Number(submission.total_invoice),
        saving: Number(submission.total_saving),
        directors: Number(submission.director_count),
      }
    : summary
      ? {
          gross: Number(summary.out_pool_total ?? 0),
          payrollGross: Number(summary.out_total_payroll_gross ?? 0),
          payrollNet: Number(summary.out_total_payroll_net ?? 0),
          statutoryEr: 0,
          invoice: Number(summary.out_total_invoice ?? 0),
          saving: Number(summary.out_total_saving ?? 0),
          directors: Number(summary.out_payout_count ?? 0),
        }
      : null

  return (
    <div>
      {/* Status + CTA strip */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-10">
        <div>
          <div className="font-serif italic text-accent text-base mb-1">
            {periodLabel}
          </div>
          {submitted ? (
            <>
              <div className="font-serif text-2xl text-ink">
                Submitted to Finance
              </div>
              <div className="font-mono text-xs text-muted mt-1">
                {dayjs(submission.submitted_at).format('D MMM YYYY HH:mm')} ·{' '}
                {totals?.directors} director{totals?.directors === 1 ? '' : 's'} · Finance sees
                these totals + the per-subsidiary split on Billing
              </div>
            </>
          ) : (
            <>
              <div className="font-serif text-2xl text-ink">Not submitted yet</div>
              <div className="font-mono text-xs text-muted mt-1">
                {hasPayouts
                  ? 'Preview below — submitting makes these figures visible to Finance immediately (no approval round-trip)'
                  : 'Calculate director salary on the Calculation tab first'}
              </div>
            </>
          )}
        </div>
        <div className="shrink-0">
          {submitted ? (
            <ReopenDirectorSalaryButton period={period} />
          ) : (
            <SubmitDirectorSalaryButton
              period={period}
              totalGross={totals?.gross ?? 0}
              disabled={!hasPayouts}
              disabledHint={
                hasPayouts ? undefined : 'Save & Calculate on the Calculation tab first'
              }
            />
          )}
        </div>
      </div>

      {/* Totals strip — what Finance receives */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-12 border-y border-hairline py-6">
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total Gross (Pool)</div>
            <div className="num text-num-ink text-xl tracking-[-0.01em] mt-1">{formatMoney(totals.gross)}</div>
          </div>
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Payroll (75%)</div>
            <div className="num text-graphite text-md mt-1">{formatMoney(totals.payrollGross)}</div>
          </div>
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Invoice (25%)</div>
            <div className="num text-graphite text-md mt-1">{formatMoney(totals.invoice)}</div>
          </div>
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Saving (5%)</div>
            <div className="num text-graphite text-md mt-1">{formatMoney(totals.saving)}</div>
          </div>
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Net to Directors</div>
            <div className="num text-num-ink text-md mt-1 font-semibold">{formatMoney(totals.payrollNet)}</div>
          </div>
        </div>
      )}

      {/* Per-subsidiary contribution — what Finance bills each company */}
      <section className="mb-16">
        <div className="sect-head">
          <h2>Per-Subsidiary Contribution</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {byCompany.length} COMPAN{byCompany.length === 1 ? 'Y' : 'IES'}
          </span>
        </div>
        {byCompany.length === 0 ? (
          <p className="font-serif italic text-graphite text-sm">
            No CTC entered for this period yet — fill the CTC grid on the Calculation tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Subsidiary</th>
                  <th className="right">CTC Contribution</th>
                </tr>
              </thead>
              <tbody>
                {byCompany.map(r => (
                  <tr key={r.company_id}>
                    <td>
                      <div className="font-serif text-[15px] text-ink">{r.company_short_code}</div>
                      <div className="font-mono text-[11px] text-graphite mt-0.5">{r.company_name}</div>
                    </td>
                    <td className="num">{formatMoney(r.total_ctc)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-serif italic text-accent">Total</td>
                  <td className="num font-semibold">{formatMoney(byCompanyTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="font-sans text-xs text-muted mt-3">
          Finance bills each subsidiary via Create Invoice → Director attribution; the
          modal auto-fills from these amounts.
        </p>
      </section>
    </div>
  )
}
