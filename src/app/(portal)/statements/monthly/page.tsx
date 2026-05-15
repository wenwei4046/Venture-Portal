import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import GenerateStatementsButton from '../_components/GenerateStatementsButton'
import StatementsTabHeader from '../_components/StatementsTabHeader'
import StatementsPeriodTable from '../_components/StatementsPeriodTable'

export default async function MonthlyStatementsPage() {
  const user = await requireRole(['principal', 'finance'])
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

  const byPeriod = new Map<string, typeof statementList>()
  for (const s of statementList) {
    const period = s.period_month
    const list = byPeriod.get(period) ?? []
    list.push(s)
    byPeriod.set(period, list)
  }

  const latestPeriod = Array.from(byPeriod.keys()).sort().reverse()[0]
  const draftCount = statementList.filter((s) => s.status === 'draft').length
  const issuedCount = statementList.filter((s) => s.status === 'issued').length
  const paidCount = statementList.filter((s) => s.status === 'paid').length

  const canGenerate = user.role === 'finance'

  return (
    <div>
      <StatementsTabHeader active="statements" />
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · MONTHLY STATEMENTS
          </div>
          <h1 className="page-title">Statements</h1>
        </div>
        <div className="flex gap-2">
          {canGenerate ? <GenerateStatementsButton /> : null}
          <Link
            href="/statements/monthly/export?format=xlsx"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export Excel
          </Link>
          <Link
            href="/statements/monthly/export?format=pdf"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export PDF
          </Link>
        </div>
      </div>

      {/* ───────── Summary ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            {latestPeriod ? `Latest period` : 'No statements yet'}
          </div>
          <div className="font-serif text-[44px] md:text-hero text-num-ink leading-none tracking-[-0.01em]">
            {latestPeriod ? (
              dayjs(latestPeriod).format('MMMM YYYY')
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
            {statementList.length} TOTAL{' '}
            {statementList.length === 1 ? 'STATEMENT' : 'STATEMENTS'}
          </div>
        </div>

        {statementList.length > 0 ? (
          <div className="lg:col-span-5 space-y-2">
            {draftCount > 0 ? (
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-md text-graphite">draft</em>
                <span className="text-ink tabular">{draftCount}</span>
              </div>
            ) : null}
            {issuedCount > 0 ? (
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-md text-alert">issued</em>
                <span className="text-ink tabular">{issuedCount}</span>
              </div>
            ) : null}
            {paidCount > 0 ? (
              <div className="flex items-baseline justify-between font-mono text-sm">
                <em className="font-serif text-md text-ledger">paid</em>
                <span className="text-ink tabular">{paidCount}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ───────── Statements by period ───────── */}
      {statementList.length === 0 ? (
        <EmptyState canGenerate={canGenerate} />
      ) : (
        Array.from(byPeriod.entries()).map(([period, periodStatements]) => (
          <section key={period} className="mb-12">
            <div className="sect-head">
              <h2>{dayjs(period).format('MMMM YYYY')}</h2>
              <span className="rule" aria-hidden />
              <span className="count">{periodStatements.length} {periodStatements.length === 1 ? 'STATEMENT' : 'STATEMENTS'}</span>
            </div>

            <div className="overflow-x-auto">
              <StatementsPeriodTable
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
