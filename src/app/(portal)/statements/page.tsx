import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import GenerateStatementsButton from './_components/GenerateStatementsButton'

export default async function StatementsPage() {
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

  // Group by period for the summary view
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
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Statements</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Monthly consolidated statements. <em>Invoice items minus contra items</em>{' '}
            per subsidiary per month.
          </p>
        </div>
        {canGenerate ? <GenerateStatementsButton /> : null}
      </div>

      {/* ───────── Summary ───────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">
            {latestPeriod ? `Latest period` : 'No statements yet'}
          </div>
          <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
            {latestPeriod ? (
              dayjs(latestPeriod).format('MMMM YYYY')
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {statementList.length} total{' '}
            {statementList.length === 1 ? 'statement' : 'statements'}
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
            <h2 className="font-serif text-2xl text-ink mb-1">
              {dayjs(period).format('MMMM YYYY')}
            </h2>
            <p className="font-serif italic text-graphite text-sm mb-4">
              {periodStatements.length}{' '}
              {periodStatements.length === 1 ? 'statement' : 'statements'}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Company</th>
                    <th className="text-right py-3 pr-4 font-medium">Invoice</th>
                    <th className="text-right py-3 pr-4 font-medium">Contra</th>
                    <th className="text-right py-3 pr-4 font-medium">Net</th>
                    <th className="text-left py-3 pr-4 font-medium">Status</th>
                    <th className="py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {periodStatements.map((s) => {
                    const company = companyMap.get(s.company_id)
                    return (
                      <tr
                        key={s.id}
                        className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
                      >
                        <td className="py-4 pr-4">
                          <div className="font-serif text-md text-ink">
                            {company?.name ?? '—'}
                          </div>
                          <div className="font-mono text-xs text-muted">
                            {company?.code}
                          </div>
                        </td>
                        <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">
                          {Number(s.total_invoice) > 0
                            ? formatMoney(Number(s.total_invoice))
                            : '—'}
                        </td>
                        <td className="py-4 pr-4 text-right font-mono tabular font-medium text-graphite">
                          {Number(s.total_contra) > 0
                            ? formatMoney(-Number(s.total_contra))
                            : '—'}
                        </td>
                        <td className="py-4 pr-4 text-right font-mono tabular font-medium text-ink font-semibold">
                          {formatMoney(Number(s.net_amount))}
                        </td>
                        <td className="py-4 pr-4">
                          <StatementStatus status={s.status} />
                        </td>
                        <td className="py-4 text-right">
                          <Link
                            href={`/statements/${s.id}`}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function StatementStatus({ status }: { status: string }) {
  if (status === 'draft') return <em className="font-serif text-graphite text-sm">draft</em>
  if (status === 'issued') return <em className="font-serif text-alert text-sm">issued</em>
  if (status === 'paid') return <em className="font-serif text-ledger text-sm">paid</em>
  if (status === 'partial') return <em className="font-serif text-alert text-sm">partial</em>
  return <em className="font-serif text-muted text-sm">{status}</em>
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
