// Director Salary — v2 flow (2026-07-17): the calculation engine
// (75/25 split · 5% saving · advance) is retired. Two lines now run
// straight through to Finance:
//   1. Pool Breakdown (Billing)  — HR keys CTC per subsidiary → Save
//   2. Director Payroll (InfoTech) — actual run imported verbatim
// Submit (Submission tab) snapshots BOTH: payroll totals from the InfoTech
// table + the per-subsidiary CTC split for billing.

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import Link from 'next/link'
import CTCInputGrid from './_components/CTCInputGrid'
import SubmitDirectorSalaryButton from './_components/SubmitDirectorSalaryButton'
import ReopenDirectorSalaryButton from './_components/ReopenDirectorSalaryButton'
import DirectorPayrollActualGrid, {
  DirectorPayrollEmptyState,
  type DirectorPayrollRowData,
} from './_components/DirectorPayrollActualGrid'
import DirectorPeriodPicker from './_components/DirectorPeriodPicker'

interface Props {
  searchParams: Promise<{ period?: string; tab?: string }>
}

interface ByCompanyRow {
  company_id: string
  company_name: string
  company_short_code: string
  // Component breakdown (2026-07-13). Optional: submissions snapshotted
  // before the breakdown existed only carry total_ctc — render '—' then.
  basic?: number | null
  kpi?: number | null
  allowance?: number | null
  epf_er?: number | null
  socso_er?: number | null
  eis_er?: number | null
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
    { data: submission },
    { data: liveByCompany },
    { data: actualPayrollRows },
    { data: fundingRequest },
  ] = await Promise.all([
    supabase.from('directors').select('id, name, code, weightage, min_payout').eq('status', 'active').order('code'),
    supabase.from('companies').select('id, name, short_code, director_heads').eq('is_active', true).order('name'),
    supabase.from('director_ctc').select('*').eq('period_month', period),
    supabase
      .from('director_salary_submissions')
      .select('*')
      .eq('period_month', period)
      .maybeSingle(),
    supabase.rpc('get_director_ctc_by_company', { p_period_month: period }),
    supabase
      .from('director_monthly_payroll')
      .select('*')
      .eq('period_month', period)
      .order('employee_name'),
    // Auto-filed at submit (mig 20260727100000) — run-less director request.
    supabase
      .from('payroll_payment_requests')
      .select('id, amount, status')
      .is('payroll_run_id', null)
      .eq('period_month', period)
      .in('status', ['submitted', 'pv_generated', 'completed'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Director actual payroll (InfoTech import) — verbatim rows + director code.
  const actualRows: DirectorPayrollRowData[] = (actualPayrollRows ?? []).map(r => ({
    id: r.id,
    director_id: r.director_id,
    director_code: directors?.find(d => d.id === r.director_id)?.code ?? null,
    employee_code: r.employee_code,
    employee_name: r.employee_name,
    dept_name: r.dept_name,
    basic_salary: Number(r.basic_salary),
    statutory_allowance: Number(r.statutory_allowance),
    non_statutory_allowance: Number(r.non_statutory_allowance),
    ot_amount: Number(r.ot_amount),
    commission_amount: Number(r.commission_amount),
    no_pay_amount: Number(r.no_pay_amount),
    deduction_amount: Number(r.deduction_amount),
    skbbk_amount: Number(r.skbbk_amount),
    epf_er: Number(r.epf_er),
    epf_ee: Number(r.epf_ee),
    socso_er: Number(r.socso_er),
    socso_ee: Number(r.socso_ee),
    eis_er: Number(r.eis_er),
    eis_ee: Number(r.eis_ee),
    pcb: Number(r.pcb),
    gross: Number(r.gross),
    net: Number(r.net),
    source: r.source,
  }))
  const hasActualPayroll = actualRows.length > 0
  const hasCtc = (ctcRows?.length ?? 0) > 0

  // Live preview totals for the Submission tab — computed from the InfoTech
  // table EXACTLY the way submit_director_salary_to_finance v2 computes the
  // snapshot, so what HR previews is what Finance receives.
  const liveTotals = hasActualPayroll
    ? actualRows.reduce(
        (acc, r) => ({
          gross: acc.gross + r.gross,
          payrollGross: acc.payrollGross + r.gross,
          payrollNet: acc.payrollNet + r.net,
          statutoryEr: acc.statutoryEr + r.epf_er + r.socso_er + r.eis_er,
          invoice: 0,
          saving: 0,
          directors: acc.directors + 1,
        }),
        { gross: 0, payrollGross: 0, payrollNet: 0, statutoryEr: 0, invoice: 0, saving: 0, directors: 0 },
      )
    : null

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
        <DirectorPeriodPicker
          period={period}
          basePath="/director-salary"
          extraQuery={tab === 'submission' ? '&tab=submission' : ''}
        />
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
          {/* CTC Input Section — billing side */}
          <section className="mb-16">
            <h2 className="font-serif text-2xl text-ink mb-1">Pool Breakdown (Billing)</h2>
            <p className="font-serif italic text-graphite text-sm mb-4">
              What Finance bills each subsidiary · Save here, then submit on the{' '}
              <Link href={tabHref('submission')} className="text-accent hover:text-accent-hover not-italic">
                Submission tab →
              </Link>
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
                director_heads: Number(c.director_heads ?? 1),
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

          {/* Director Payroll (InfoTech actual) — payroll side */}
          <section className="mb-16">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-6">
              <div>
                <h2 className="font-serif text-2xl text-ink mb-1">Director Payroll (InfoTech)</h2>
                <p className="font-serif italic text-graphite text-sm">
                  Actual payroll run imported from InfoTech ·{' '}
                  <Link
                    href={tabHref('submission')}
                    className="text-accent hover:text-accent-hover not-italic"
                  >
                    {submission ? 'View submission →' : 'Submit to Finance →'}
                  </Link>
                </p>
              </div>
              <Link
                href={`/director-salary/import?period=${dayjs(period).format('YYYY-MM')}`}
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors shrink-0"
              >
                Import InfoTech →
              </Link>
            </div>

            {actualRows.length === 0 ? (
              <DirectorPayrollEmptyState period={period} />
            ) : (
              <DirectorPayrollActualGrid rows={actualRows} period={period} />
            )}
          </section>
        </>
      ) : (
        <SubmissionTab
          period={period}
          periodLabel={periodLabel}
          submission={submission}
          fundingRequest={fundingRequest ?? null}
          hasActualPayroll={hasActualPayroll}
          hasCtc={hasCtc}
          liveTotals={liveTotals}
          payrollRows={actualRows}
          liveByCompany={((liveByCompany as ByCompanyRow[] | null) ?? []).map(r => ({
            ...r,
            basic: r.basic == null ? null : Number(r.basic),
            kpi: r.kpi == null ? null : Number(r.kpi),
            allowance: r.allowance == null ? null : Number(r.allowance),
            epf_er: r.epf_er == null ? null : Number(r.epf_er),
            socso_er: r.socso_er == null ? null : Number(r.socso_er),
            eis_er: r.eis_er == null ? null : Number(r.eis_er),
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

// Sum a component column for the totals row — '—' when no row carries the
// breakdown (legacy snapshots written before the component fields existed).
function sumOrDash(rows: ByCompanyRow[], pick: (r: ByCompanyRow) => number | null | undefined) {
  const vals = rows.map(pick).filter((v): v is number => v != null)
  if (vals.length === 0) return '—'
  return formatMoney(vals.reduce((s, v) => s + v, 0))
}

// ─── Director Payroll Submission tab ─────────────────────────────────────────
// v2: payroll totals come from director_monthly_payroll (InfoTech actuals);
// the per-subsidiary split still comes from director_ctc. Both must exist
// before Submit is enabled. Transparency rule: every total the RPC writes is
// previewed here by-source BEFORE submitting.
interface SubmissionTotals {
  gross: number
  payrollGross: number
  payrollNet: number
  statutoryEr: number
  invoice: number
  saving: number
  directors: number
}

function SubmissionTab({
  period,
  periodLabel,
  submission,
  fundingRequest,
  hasActualPayroll,
  hasCtc,
  liveTotals,
  payrollRows,
  liveByCompany,
}: {
  period: string
  periodLabel: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submission: any
  fundingRequest: { id: string; amount: number; status: string } | null
  hasActualPayroll: boolean
  hasCtc: boolean
  liveTotals: SubmissionTotals | null
  payrollRows: DirectorPayrollRowData[]
  liveByCompany: ByCompanyRow[]
}) {
  const submitted = !!submission

  // Per-director payroll detail comes from the live InfoTech table (the
  // snapshot itself is aggregate-only — Finance never sees per-director
  // figures). If the live rows drift from the submitted totals, flag it.
  const livePayrollTotals = payrollRows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      net: acc.net + r.net,
      er: acc.er + r.epf_er + r.socso_er + r.eis_er,
      pcb: acc.pcb + r.pcb,
    }),
    { gross: 0, net: 0, er: 0, pcb: 0 },
  )

  // Submitted → render the snapshot; not yet → live preview of what would be
  // submitted right now.
  const byCompany: ByCompanyRow[] = submitted
    ? ((submission.by_company as ByCompanyRow[] | null) ?? []).map(r => ({
        ...r,
        basic: r.basic == null ? null : Number(r.basic),
        kpi: r.kpi == null ? null : Number(r.kpi),
        allowance: r.allowance == null ? null : Number(r.allowance),
        epf_er: r.epf_er == null ? null : Number(r.epf_er),
        socso_er: r.socso_er == null ? null : Number(r.socso_er),
        eis_er: r.eis_er == null ? null : Number(r.eis_er),
        total_ctc: Number(r.total_ctc),
      }))
    : liveByCompany
  const byCompanyTotal = byCompany.reduce((s, r) => s + r.total_ctc, 0)

  const totals: SubmissionTotals | null = submitted
    ? {
        gross: Number(submission.total_gross),
        payrollGross: Number(submission.total_payroll_gross),
        payrollNet: Number(submission.total_payroll_net),
        statutoryEr: Number(submission.total_statutory_er),
        invoice: Number(submission.total_invoice),
        saving: Number(submission.total_saving),
        directors: Number(submission.director_count),
      }
    : liveTotals

  const missing: string[] = []
  if (!hasActualPayroll) missing.push('Import the InfoTech director payroll')
  if (!hasCtc) missing.push('Save the Pool Breakdown (Billing)')

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
              {fundingRequest ? (
                <div className="font-mono text-xs mt-1">
                  <span className="text-graphite">Funding request {formatMoney(Number(fundingRequest.amount))} · </span>
                  {fundingRequest.status === 'submitted' ? (
                    <span className="text-alert">awaiting Finance</span>
                  ) : fundingRequest.status === 'pv_generated' ? (
                    <span className="text-info">PV generated — awaiting Principal</span>
                  ) : (
                    <span className="text-ledger">completed — funds staged</span>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="font-serif text-2xl text-ink">Not submitted yet</div>
              <div className="font-mono text-xs text-muted mt-1">
                {missing.length === 0
                  ? 'Preview below — submitting sends the InfoTech payroll totals + per-subsidiary CTC split to Finance immediately'
                  : `To submit: ${missing.join(' · ')}`}
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
              disabled={missing.length > 0}
              disabledHint={missing.length > 0 ? missing.join(' · ') : undefined}
            />
          )}
        </div>
      </div>

      {/* Totals strip — payroll side (InfoTech actuals) */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12 border-y border-hairline py-6">
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Total Gross (InfoTech)</div>
            <div className="num text-num-ink text-xl tracking-[-0.01em] mt-1">{formatMoney(totals.gross)}</div>
          </div>
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Net to Directors</div>
            <div className="num text-num-ink text-md mt-1 font-semibold">{formatMoney(totals.payrollNet)}</div>
          </div>
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Employer Statutory</div>
            <div className="num text-graphite text-md mt-1">{formatMoney(totals.statutoryEr)}</div>
          </div>
          <div>
            <div className="font-serif italic text-graphite text-xs uppercase tracking-wide">Directors</div>
            <div className="num text-graphite text-md mt-1">{totals.directors}</div>
          </div>
        </div>
      )}

      {/* Director Payroll (InfoTech) — per-director detail. Shown here for
          HR/Principal; the snapshot Finance receives stays aggregate-only. */}
      <section className="mb-16">
        <div className="sect-head">
          <h2>Director Payroll (InfoTech)</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {payrollRows.length} DIRECTOR{payrollRows.length === 1 ? '' : 'S'}
          </span>
        </div>
        {payrollRows.length === 0 ? (
          <p className="font-serif italic text-graphite text-sm">
            No InfoTech payroll imported for this period yet — import on the Calculation tab.
          </p>
        ) : (
          <>
            {submitted && totals &&
              (Math.abs(livePayrollTotals.gross - totals.gross) > 0.01 ||
                Math.abs(livePayrollTotals.net - totals.payrollNet) > 0.01) && (
                <div className="mb-4 rounded-md border border-alert bg-alert-bg px-3 py-2">
                  <p className="font-serif italic text-alert text-sm">
                    ⚠ The InfoTech figures changed after this submission — Reopen for edits and
                    submit again so Finance sees the current numbers.
                  </p>
                </div>
              )}
            <div className="overflow-x-auto">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Director</th>
                    <th className="right">Gross</th>
                    <th className="right">EPF ER</th>
                    <th className="right">SOCSO+EIS ER</th>
                    <th className="right">PCB</th>
                    <th className="right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollRows.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-serif text-[15px] text-ink">{r.director_code ?? r.employee_name}</div>
                        <div className="font-mono text-[11px] text-graphite mt-0.5">{r.employee_name}</div>
                      </td>
                      <td className="num">{formatMoney(r.gross)}</td>
                      <td className="num">{formatMoney(r.epf_er)}</td>
                      <td className="num">{formatMoney(r.socso_er + r.eis_er)}</td>
                      <td className="num">{formatMoney(r.pcb)}</td>
                      <td className="num font-semibold">{formatMoney(r.net)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="font-serif italic text-accent">Total</td>
                    <td className="num font-semibold">{formatMoney(livePayrollTotals.gross)}</td>
                    <td className="num font-semibold">
                      {formatMoney(payrollRows.reduce((s, r) => s + r.epf_er, 0))}
                    </td>
                    <td className="num font-semibold">
                      {formatMoney(payrollRows.reduce((s, r) => s + r.socso_er + r.eis_er, 0))}
                    </td>
                    <td className="num font-semibold">{formatMoney(livePayrollTotals.pcb)}</td>
                    <td className="num font-semibold">{formatMoney(livePayrollTotals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="font-sans text-xs text-muted mt-3">
              Per-director detail is visible to HR and Principal only — Finance receives the
              aggregate totals above, never individual salaries.
            </p>
          </>
        )}
      </section>

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
            No CTC entered for this period yet — fill the Pool Breakdown grid on the Calculation tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Subsidiary</th>
                  <th className="right">Basic</th>
                  <th className="right">KPI</th>
                  <th className="right">Allowance</th>
                  <th className="right">EPF ER</th>
                  <th className="right">SOCSO ER</th>
                  <th className="right">EIS ER</th>
                  <th className="right">Total</th>
                </tr>
              </thead>
              <tbody>
                {byCompany.map(r => (
                  <tr key={r.company_id}>
                    <td>
                      <div className="font-serif text-[15px] text-ink">{r.company_short_code}</div>
                      <div className="font-mono text-[11px] text-graphite mt-0.5">{r.company_name}</div>
                    </td>
                    <td className="num">{r.basic == null ? '—' : formatMoney(r.basic)}</td>
                    <td className="num">{r.kpi == null ? '—' : formatMoney(r.kpi)}</td>
                    <td className="num">{r.allowance == null ? '—' : formatMoney(r.allowance)}</td>
                    <td className="num">{r.epf_er == null ? '—' : formatMoney(r.epf_er)}</td>
                    <td className="num">{r.socso_er == null ? '—' : formatMoney(r.socso_er)}</td>
                    <td className="num">{r.eis_er == null ? '—' : formatMoney(r.eis_er)}</td>
                    <td className="num font-semibold">{formatMoney(r.total_ctc)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="font-serif italic text-accent">Total</td>
                  <td className="num font-semibold">{sumOrDash(byCompany, r => r.basic)}</td>
                  <td className="num font-semibold">{sumOrDash(byCompany, r => r.kpi)}</td>
                  <td className="num font-semibold">{sumOrDash(byCompany, r => r.allowance)}</td>
                  <td className="num font-semibold">{sumOrDash(byCompany, r => r.epf_er)}</td>
                  <td className="num font-semibold">{sumOrDash(byCompany, r => r.socso_er)}</td>
                  <td className="num font-semibold">{sumOrDash(byCompany, r => r.eis_er)}</td>
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
