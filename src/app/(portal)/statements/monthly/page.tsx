import Link from 'next/link'
import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { statementsSummary } from '@/lib/billing-sheet'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import GenerateStatementsButton from '../_components/GenerateStatementsButton'
import StatementsPeriodTable from '../_components/StatementsPeriodTable'

// The monthly statements on the sheet (2026-10-07; the user approved the
// Invoice / Statements sample): four summary cards, then each month as a
// section over its table. Generating a statement and a statement's own page
// are as they were.

/** "ALL DRAFT", or "1 ISSUED · 1 PAID" — what state a month's statements are in. */
function statusMix(statements: Array<{ status: string }>): string {
  const counts = new Map<string, number>()
  for (const s of statements) counts.set(s.status, (counts.get(s.status) ?? 0) + 1)
  if (counts.size === 1) return `ALL ${[...counts.keys()][0].toUpperCase()}`
  return ['draft', 'issued', 'paid']
    .filter((st) => counts.has(st))
    .map((st) => `${counts.get(st)} ${st.toUpperCase()}`)
    .join(' · ')
}

export default async function MonthlyStatementsPage() {
  const user = await requirePermission('treasury')
  const supabase = await createClient()

  const [{ data: statements }, { data: companies }] = await Promise.all([
    supabase
      .from('monthly_statements')
      .select('*')
      .order('period_month', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('companies').select('id, name, short_code'),
  ])

  const statementList = statements ?? []
  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }])
  )

  // Group by period
  const byPeriod = new Map<string, typeof statementList>()
  for (const s of statementList) {
    const period = s.period_month
    const list = byPeriod.get(period) ?? []
    list.push(s)
    byPeriod.set(period, list)
  }

  const summary = statementsSummary(statementList)
  const latestLabel = summary.latestPeriod ? dayjs(summary.latestPeriod).format('MMMM YYYY') : null
  const latestMonth = summary.latestPeriod ? dayjs(summary.latestPeriod).format('MMMM') : null
  const latestMix = summary.latestPeriod ? statusMix(byPeriod.get(summary.latestPeriod) ?? []).toLowerCase() : ''
  // Generating raises the month's statements: Treasury · Create (2026-10-08, PR2).
  const canGenerate = canDo(user, 'treasury', 'create')

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div className="shrink-0">
          <div className="page-eyebrow">
            <em>II.</em> FUND IN / OUT · MONTHLY STATEMENTS
          </div>
          <h1 className="page-title">Statements</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
          {canGenerate ? <GenerateStatementsButton /> : null}
          <Link href="/statements/monthly/export?format=xlsx" className="btn-quiet-sheet">
            Excel
          </Link>
          <Link href="/statements/monthly/export?format=pdf" className="btn-quiet-sheet">
            PDF
          </Link>
        </div>
      </div>

      {/* ───────── Summary cards ───────── */}
      <StatCards label="Statements">
        <StatCard
          tone="primary"
          label="Latest period"
          value={latestLabel ?? '—'}
          icon="calendar"
          note={
            summary.latestPeriod
              ? `${summary.latestCount} ${summary.latestCount === 1 ? 'statement' : 'statements'} · ${latestMix}`
              : 'No statements yet'
          }
        />
        <StatCard
          label={latestMonth ? `Net · ${latestMonth}` : 'Net'}
          value={formatMoney(summary.latestNet)}
          icon="swap"
          note={summary.latestPeriod ? `invoice ${formatMoney(summary.latestInvoice).replace('RM ', '')} − contra ${formatMoney(summary.latestContra).replace('RM ', '')}` : '—'}
        />
        <StatCard
          tone={summary.draft > 0 ? 'alert' : 'default'}
          label="Draft"
          value={String(summary.draft)}
          icon="clock"
          note={summary.draft > 0 ? 'waiting to be issued' : 'none waiting'}
        />
        <StatCard
          label="All statements"
          value={String(summary.total)}
          icon="layers"
          note={`${summary.issued} issued · ${summary.paid} paid`}
        />
      </StatCards>

      {/* ───────── Statements by period ───────── */}
      {statementList.length === 0 ? (
        <EmptyState canGenerate={canGenerate} />
      ) : (
        Array.from(byPeriod.entries()).map(([period, periodStatements]) => (
          <section key={period} className="mb-12">
            <div className="sect-head">
              <h2>{dayjs(period).format('MMMM YYYY')}</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {periodStatements.length} {periodStatements.length === 1 ? 'STATEMENT' : 'STATEMENTS'} · {statusMix(periodStatements)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <StatementsPeriodTable
                canSetDefault={canGenerate}
                rows={periodStatements.map((s) => {
                  const company = companyMap.get(s.company_id)
                  return {
                    id: s.id,
                    companyName: company?.name ?? '—',
                    companyCode: company?.code ?? '',
                    totalInvoice: Number(s.total_invoice),
                    totalContra: Number(s.total_contra),
                    netAmount: Number(s.net_amount),
                    status: s.status,
                  }
                })}
              />
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function EmptyState({ canGenerate }: { canGenerate: boolean }) {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-graphite text-lg mb-2">
        No statements yet.
      </p>
      <p className="font-serif italic text-muted text-sm">
        {canGenerate ? (
          <>
            Finance generates monthly statements for all active subsidiaries.
            <br />
            Click <em>Generate statements</em> above to start.
          </>
        ) : (
          <>Finance hasn&apos;t generated any statements yet.</>
        )}
      </p>
    </div>
  )
}
