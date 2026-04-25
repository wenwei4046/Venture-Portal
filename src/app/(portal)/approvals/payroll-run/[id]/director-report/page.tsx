import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'

interface PageProps {
  params: Promise<{ id: string }>
}

function formatPeriodLabel(period: string): string {
  const d = new Date(period + 'T00:00:00Z')
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default async function DirectorReportPage({ params }: PageProps) {
  // PDPA: only Principal + HR may see per-director calculation detail.
  // Finance gets lump-sum OPEX on the parent approval page.
  await requireRole(['principal', 'hr'])

  const { id } = await params
  const supabase = await createClient()

  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, period_month, director_salary_total')
    .eq('id', id)
    .maybeSingle()

  if (!run) notFound()

  const [{ data: ctcRows }, { data: payoutRows }] = await Promise.all([
    supabase
      .from('director_ctc')
      .select('basic, kpi, allowance, employer_epf, employer_socso, employer_eis, total_ctc, company_id, companies(name, short_code)')
      .eq('period_month', run.period_month),
    supabase
      .from('director_payouts')
      .select('id, gross_amount, saving_amount, advance_amount, advance_repaid, advance_balance, payroll_gross, payroll_epf_er, payroll_epf_ee, payroll_socso_er, payroll_socso_ee, payroll_eis_er, payroll_eis_ee, payroll_pcb, payroll_net, invoice_base, invoice_epf_er, invoice_socso_er, invoice_eis_er, invoice_total, statutory_surplus, calculation_snapshot, directors(name, code)')
      .eq('period_month', run.period_month)
      .order('created_at'),
  ])

  const ctc = ctcRows ?? []
  const payouts = payoutRows ?? []

  // Aggregate CTC by company
  const byCompany = new Map<
    string,
    { name: string; short_code: string; basic: number; kpi: number; allowance: number; er: number; total: number }
  >()
  for (const r of ctc) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comp = (r as any).companies
    const key = r.company_id as string
    const existing = byCompany.get(key) ?? {
      name: comp?.name ?? '—',
      short_code: comp?.short_code ?? '',
      basic: 0,
      kpi: 0,
      allowance: 0,
      er: 0,
      total: 0,
    }
    existing.basic += Number(r.basic ?? 0)
    existing.kpi += Number(r.kpi ?? 0)
    existing.allowance += Number(r.allowance ?? 0)
    existing.er +=
      Number(r.employer_epf ?? 0) + Number(r.employer_socso ?? 0) + Number(r.employer_eis ?? 0)
    existing.total += Number(r.total_ctc ?? 0)
    byCompany.set(key, existing)
  }
  const companies = Array.from(byCompany.values()).sort((a, b) => b.total - a.total)

  const totals = companies.reduce(
    (acc, c) => ({
      basic: acc.basic + c.basic,
      kpi: acc.kpi + c.kpi,
      allowance: acc.allowance + c.allowance,
      er: acc.er + c.er,
      total: acc.total + c.total,
    }),
    { basic: 0, kpi: 0, allowance: 0, er: 0, total: 0 },
  )

  // Per-director totals for the summary row
  const directorTotals = payouts.reduce(
    (acc, p) => ({
      gross: acc.gross + Number(p.gross_amount ?? 0),
      saving: acc.saving + Number(p.saving_amount ?? 0),
      advance: acc.advance + Number(p.advance_amount ?? 0),
      payrollNet: acc.payrollNet + Number(p.payroll_net ?? 0),
      invoiceTotal: acc.invoiceTotal + Number(p.invoice_total ?? 0),
    }),
    { gross: 0, saving: 0, advance: 0, payrollNet: 0, invoiceTotal: 0 },
  )

  return (
    <div>
      <Link
        href={`/approvals/payroll-run/${id}`}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to payroll run
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>IV.</em> APPROVALS · DIRECTOR SALARY · {formatPeriodLabel(run.period_month).toUpperCase()}
          </div>
          <h1 className="page-title">Director Salary Breakdown</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Per-company CTC, per-director payout, and calculation details attached to this payroll submission.
            <em> Restricted to Principal and HR.</em>
          </p>
        </div>
      </div>

      {/* Per-company CTC */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>By company</h2>
          <span className="rule" aria-hidden />
          <span className="count">{companies.length} SUBSIDIARY{companies.length === 1 ? '' : 'S'} · CTC TO DIRECTOR POOL</span>
        </div>
        {companies.length === 0 ? (
          <p className="font-serif italic text-muted">No CTC rows recorded for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="right">Basic</th>
                  <th className="right">KPI</th>
                  <th className="right">Allowance</th>
                  <th className="right">ER Stat</th>
                  <th className="right">Total CTC</th>
                </tr>
              </thead>
              <tbody>
                {companies.map(c => (
                  <tr key={c.short_code}>
                    <td>
                      <div className="font-serif text-md text-ink">{c.name}</div>
                      <div className="font-mono text-xs text-muted">{c.short_code}</div>
                    </td>
                    <td className="num">{formatMoney(c.basic)}</td>
                    <td className="num">{formatMoney(c.kpi)}</td>
                    <td className="num">{formatMoney(c.allowance)}</td>
                    <td className="num text-graphite">{formatMoney(c.er)}</td>
                    <td className="num">{formatMoney(c.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-hairline bg-surface-2/40">
                  <td className="font-serif italic text-accent">Director Pool Total</td>
                  <td className="num">{formatMoney(totals.basic)}</td>
                  <td className="num">{formatMoney(totals.kpi)}</td>
                  <td className="num">{formatMoney(totals.allowance)}</td>
                  <td className="num text-graphite">{formatMoney(totals.er)}</td>
                  <td className="num text-accent">{formatMoney(totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Per-director payout */}
      <section className="mb-12">
        <div className="sect-head">
          <h2>By director</h2>
          <span className="rule" aria-hidden />
          <span className="count">{payouts.length} DIRECTOR{payouts.length === 1 ? '' : 'S'} · GROSS · SAVING · ADVANCE · NET · INVOICE</span>
        </div>
        {payouts.length === 0 ? (
          <p className="font-serif italic text-muted">No director payouts calculated for this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Director</th>
                  <th className="right">Gross</th>
                  <th className="right">Co-saving (5%)</th>
                  <th className="right">Advance</th>
                  <th className="right">Payroll Net</th>
                  <th className="right">Invoice Portion</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const director = (p as any).directors
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="font-serif text-md text-ink">{director?.name ?? '—'}</div>
                        <div className="font-mono text-xs text-muted">{director?.code}</div>
                      </td>
                      <td className="num">{formatMoney(Number(p.gross_amount ?? 0))}</td>
                      <td className="num text-graphite">{formatMoney(Number(p.saving_amount ?? 0))}</td>
                      <td className="num text-graphite">{formatMoney(Number(p.advance_amount ?? 0))}</td>
                      <td className="num">{formatMoney(Number(p.payroll_net ?? 0))}</td>
                      <td className="num text-graphite">{formatMoney(Number(p.invoice_total ?? 0))}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-hairline bg-surface-2/40">
                  <td className="font-serif italic text-accent">Total</td>
                  <td className="num">{formatMoney(directorTotals.gross)}</td>
                  <td className="num text-graphite">{formatMoney(directorTotals.saving)}</td>
                  <td className="num text-graphite">{formatMoney(directorTotals.advance)}</td>
                  <td className="num">{formatMoney(directorTotals.payrollNet)}</td>
                  <td className="num text-graphite">{formatMoney(directorTotals.invoiceTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Calculation details per director */}
      {payouts.length > 0 && (
        <section className="mb-12">
          <div className="sect-head">
            <h2>Calculation details</h2>
            <span className="rule" aria-hidden />
            <span className="count">IMMUTABLE SNAPSHOT · INPUTS · RATES · WEIGHTAGE</span>
          </div>
          <div className="space-y-3">
            {payouts.map(p => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const director = (p as any).directors
              return (
                <details key={p.id} className="border border-hairline rounded-md bg-surface">
                  <summary className="cursor-pointer px-4 py-3 font-serif text-md text-ink flex items-baseline justify-between">
                    <span>
                      {director?.name ?? '—'} <span className="font-mono text-xs text-muted ml-2">{director?.code}</span>
                    </span>
                    <span className="font-mono text-xs text-muted">gross <span className="num">{formatMoney(Number(p.gross_amount ?? 0))}</span></span>
                  </summary>
                  <div className="px-4 pb-4 pt-1">
                    <FormulaBreakdown payout={p} />
                  </div>
                  {p.calculation_snapshot != null && (
                    <div className="border-t border-hairline px-4 py-3">
                      <div className="font-sans text-xs uppercase tracking-wide text-muted mb-1">Raw snapshot</div>
                      <pre className="font-mono text-[11px] text-graphite whitespace-pre-wrap break-words leading-relaxed bg-paper p-3 rounded">
                        {JSON.stringify(p.calculation_snapshot, null, 2)}
                      </pre>
                    </div>
                  )}
                </details>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

// Narrative per-director breakdown — mirrors the 7-step calculation in
// src/lib/salary.ts so Principal/HR can eyeball the math without parsing
// the raw JSON snapshot underneath.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FormulaBreakdown({ payout }: { payout: any }) {
  const gross = Number(payout.gross_amount ?? 0)
  const saving = Number(payout.saving_amount ?? 0)
  const afterSaving = gross - saving
  const advance = Number(payout.advance_amount ?? 0)
  const advanceRepaid = Number(payout.advance_repaid ?? 0)
  const advanceBalance = Number(payout.advance_balance ?? 0)
  const payrollGross = Number(payout.payroll_gross ?? 0)
  const invoiceBase = Number(payout.invoice_base ?? 0)
  const payrollCalc = afterSaving * 0.75
  const epfEr = Number(payout.payroll_epf_er ?? 0)
  const epfEe = Number(payout.payroll_epf_ee ?? 0)
  const socsoEr = Number(payout.payroll_socso_er ?? 0)
  const socsoEe = Number(payout.payroll_socso_ee ?? 0)
  const eisEr = Number(payout.payroll_eis_er ?? 0)
  const eisEe = Number(payout.payroll_eis_ee ?? 0)
  const pcb = Number(payout.payroll_pcb ?? 0)
  const payrollNet = Number(payout.payroll_net ?? 0)
  const invoiceEpfEr = Number(payout.invoice_epf_er ?? 0)
  const invoiceSocsoEr = Number(payout.invoice_socso_er ?? 0)
  const invoiceEisEr = Number(payout.invoice_eis_er ?? 0)
  const invoiceTotal = Number(payout.invoice_total ?? 0)
  const statSurplus = Number(payout.statutory_surplus ?? 0)

  return (
    <div className="space-y-4 text-sm">
      <Step n="1" title="Gross from Director Pool">
        <Row label="Pool × Weightage ÷ Total Weightage" value={gross} strong />
      </Step>

      <Step n="2" title="5% Co-saving → Venture Pool">
        <Row label="Gross" value={gross} />
        <Row label="− 5% Saving" value={-saving} />
        <Row label="= After Saving" value={afterSaving} strong divider />
      </Step>

      <Step n="3" title="75 / 25 Split">
        <Row label="Payroll Portion (75%)" value={payrollCalc} />
        <Row label="Invoice Portion (25%)" value={invoiceBase} />
      </Step>

      {advance > 0 && (
        <Step n="4" title="Min-Payout Top-up (Advance)">
          <Row label="Natural payroll (75%)" value={payrollCalc} />
          <Row label="+ Advance issued this month" value={advance} />
          <Row label="= Payroll Gross (lifted to min payout)" value={payrollGross} strong divider />
        </Step>
      )}

      <Step n="5" title="Payroll Deductions">
        <Row label="Payroll Gross" value={payrollGross} />
        <Row label={`− EPF (ER ${formatMoney(epfEr)} + EE ${formatMoney(epfEe)})`} value={-(epfEr + epfEe)} />
        <Row label={`− SOCSO (ER ${formatMoney(socsoEr)} + EE ${formatMoney(socsoEe)})`} value={-(socsoEr + socsoEe)} />
        <Row label={`− EIS (ER ${formatMoney(eisEr)} + EE ${formatMoney(eisEe)})`} value={-(eisEr + eisEe)} />
        <Row label="− PCB" value={-pcb} />
        {advanceRepaid > 0 && (
          <Row label="− Advance repaid (carry-forward)" value={-advanceRepaid} />
        )}
        <Row label="= Payroll Net" value={payrollNet} strong divider />
      </Step>

      <Step n="6" title="Invoice to Outsource Entity">
        <Row label="Invoice Base (25%)" value={invoiceBase} />
        <Row label="+ Employer EPF" value={invoiceEpfEr} />
        <Row label="+ Employer SOCSO" value={invoiceSocsoEr} />
        <Row label="+ Employer EIS" value={invoiceEisEr} />
        <Row label="= Invoice Total" value={invoiceTotal} strong divider />
      </Step>

      <Step n="7" title="Statutory Surplus → Venture Pool">
        <Row label="ER In from CTC − ER Out (payroll + invoice)" value={statSurplus} strong />
      </Step>

      {advanceBalance !== 0 && (
        <div className="border-t border-hairline pt-3 font-serif italic text-xs text-muted">
          Running advance balance (carry forward next month): {formatMoney(advanceBalance)}
        </div>
      )}
    </div>
  )
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-serif italic text-xs uppercase tracking-wider text-accent mb-1.5">
        Step {n} · {title}
      </div>
      <div className="pl-3 border-l border-hairline/60 space-y-0.5">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, strong, divider }: { label: string; value: number; strong?: boolean; divider?: boolean }) {
  return (
    <div
      className={
        'flex justify-between items-baseline py-0.5 ' +
        (divider ? 'border-t border-hairline/60 mt-1 pt-1 ' : '')
      }
    >
      <span className={strong ? 'font-serif text-ink' : 'font-serif italic text-graphite text-xs'}>
        {label}
      </span>
      <span className={`num ${value < 0 ? 'neg' : ''} ${strong ? 'text-sm' : 'text-xs'}`}>
        {value < 0 ? `(${formatMoney(-value)})` : formatMoney(value)}
      </span>
    </div>
  )
}
