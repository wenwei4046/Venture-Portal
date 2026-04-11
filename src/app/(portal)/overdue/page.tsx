import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { markOverduePaid } from './actions'
import DetectOverdueButton from './_components/DetectOverdueButton'
import EscalateButton from './_components/EscalateButton'

type OverdueRow = {
  id: string
  loan_id: string
  period_month: string
  overdue_days: number
  overdue_stage: 'grace' | 'late_1' | 'late_2' | 'escalation'
  penalty_rate: number | null
  penalty_amount: number | null
  status: 'pending' | 'paid' | 'escalated'
  created_at: string
}

export default async function OverduePage() {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const [{ data: overdueRows }, { data: loans }, { data: companies }, { data: outstandingRows }] =
    await Promise.all([
      supabase
        .from('overdue_records')
        .select('*')
        .order('period_month', { ascending: false })
        .order('overdue_days', { ascending: false }),
      supabase.from('loans').select('id, company_id, principal, effective_rate, status'),
      supabase.from('companies').select('id, name, short_code, tier'),
      supabase.from('loan_outstanding').select('loan_id, outstanding'),
    ])

  const rows = (overdueRows ?? []) as OverdueRow[]
  const loanMap = new Map((loans ?? []).map((l) => [l.id, l]))
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code, tier: c.tier }])
  )
  const outstandingMap = new Map(
    (outstandingRows ?? []).map((o) => [o.loan_id, Number(o.outstanding)])
  )

  const active = rows.filter((r) => r.status === 'pending')
  const totalPenalty = active.reduce((sum, r) => sum + Number(r.penalty_amount ?? 0), 0)

  const stageCounts = active.reduce(
    (acc, r) => {
      acc[r.overdue_stage] = (acc[r.overdue_stage] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const canFinanceAct = user.role === 'finance'

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Overdue &amp; Netting</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Loans past grace period. <em>Penalty accrues per stage until escalated.</em>
          </p>
        </div>
        {canFinanceAct ? <DetectOverdueButton /> : null}
      </div>

      {/* ───────── Hero: penalty outstanding ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            Penalty outstanding
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {totalPenalty > 0 ? (
              formatMoney(totalPenalty)
            ) : (
              <>
                RM <span className="text-muted">—</span>
              </>
            )}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {active.length} pending {active.length === 1 ? 'record' : 'records'}
          </div>
        </div>

        {active.length > 0 ? (
          <div className="lg:col-span-5 space-y-2">
            {(['grace', 'late_1', 'late_2', 'escalation'] as const).map((stage) => {
              const count = stageCounts[stage] ?? 0
              if (count === 0) return null
              return (
                <div
                  key={stage}
                  className="flex items-baseline justify-between font-mono text-sm"
                >
                  <em className="font-serif text-md text-graphite">
                    {stageLabel(stage)}
                  </em>
                  <span className="text-ink tabular">{count}</span>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* ───────── Active overdue list ───────── */}
      {active.length === 0 ? (
        <AllClearState canFinanceAct={canFinanceAct} />
      ) : (
        <section className="mb-12">
          <h2 className="font-serif text-2xl text-ink mb-1">Active overdue</h2>
          <p className="font-serif italic text-graphite text-sm mb-6">
            Sorted by period, <em>longest overdue first</em>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Company</th>
                  <th className="text-right py-3 pr-4 font-medium">Outstanding</th>
                  <th className="text-right py-3 pr-4 font-medium">Days</th>
                  <th className="text-left py-3 pr-4 font-medium">Stage</th>
                  <th className="text-right py-3 pr-4 font-medium">Penalty</th>
                  <th className="py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {active.map((row) => {
                  const loan = loanMap.get(row.loan_id)
                  const company = loan ? companyMap.get(loan.company_id) : undefined
                  const outstanding = outstandingMap.get(row.loan_id) ?? Number(loan?.principal ?? 0)
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="py-4 pr-4">
                        <div className="font-serif text-md text-ink">
                          {company?.name ?? '—'}
                        </div>
                        <div className="font-mono text-xs text-muted">
                          {company?.code ?? ''} · {dayjs(row.period_month).format('MMM YYYY')}
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {formatMoney(outstanding)}
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink">
                        {row.overdue_days}d
                      </td>
                      <td className="py-4 pr-4">
                        <StageLabel stage={row.overdue_stage} />
                      </td>
                      <td className="py-4 pr-4 text-right font-mono tabular font-medium text-danger">
                        {formatMoney(Number(row.penalty_amount ?? 0))}
                      </td>
                      <td className="py-4 text-right">
                        {canFinanceAct ? (
                          <div className="flex items-center justify-end gap-3">
                            {row.overdue_stage === 'escalation' ? (
                              <EscalateButton overdueId={row.id} />
                            ) : null}
                            <form action={markOverduePaid}>
                              <input type="hidden" name="id" value={row.id} />
                              <button
                                type="submit"
                                className="text-sm text-graphite hover:text-accent font-serif italic transition-colors"
                              >
                                Mark paid
                              </button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-xs font-mono text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ───────── Escalated + paid history ───────── */}
      {rows.length > active.length ? (
        <section className="mt-12 pt-8 border-t border-hairline">
          <h2 className="font-serif text-xl text-ink mb-1">History</h2>
          <p className="font-serif italic text-graphite text-sm mb-4">
            Escalated and paid records
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Company</th>
                  <th className="text-right py-3 pr-4 font-medium">Penalty</th>
                  <th className="text-right py-3 pr-4 font-medium">Days</th>
                  <th className="text-left py-3 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((r) => r.status !== 'pending')
                  .map((row) => {
                    const loan = loanMap.get(row.loan_id)
                    const company = loan ? companyMap.get(loan.company_id) : undefined
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-hairline last:border-0 text-muted"
                      >
                        <td className="py-3 pr-4 font-serif">{company?.name ?? '—'}</td>
                        <td className="py-3 pr-4 text-right font-mono tabular">
                          {formatMoney(Number(row.penalty_amount ?? 0))}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono tabular">
                          {row.overdue_days}d
                        </td>
                        <td className="py-3 pr-4">
                          <em className="font-serif italic text-xs">
                            {row.status === 'escalated' ? 'escalated' : 'paid'}
                          </em>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function StageLabel({ stage }: { stage: OverdueRow['overdue_stage'] }) {
  if (stage === 'grace')
    return <em className="font-serif text-graphite text-sm">grace</em>
  if (stage === 'late_1')
    return <em className="font-serif text-alert text-sm">late 1</em>
  if (stage === 'late_2')
    return <em className="font-serif text-alert text-sm">late 2</em>
  return <em className="font-serif text-danger text-sm">escalation</em>
}

function stageLabel(stage: string): string {
  if (stage === 'grace') return 'grace'
  if (stage === 'late_1') return 'late 1'
  if (stage === 'late_2') return 'late 2'
  if (stage === 'escalation') return 'escalation'
  return stage
}

function AllClearState({ canFinanceAct }: { canFinanceAct: boolean }) {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-ledger text-lg mb-2">All loans current.</p>
      <p className="font-serif italic text-muted text-sm">
        {canFinanceAct ? (
          <>
            No overdue records pending. Click <em>Detect overdue</em> to scan active loans.
          </>
        ) : (
          <>No overdue records pending.</>
        )}
      </p>
    </div>
  )
}
