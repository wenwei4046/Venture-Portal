import Link from 'next/link'
import dayjs from 'dayjs'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { officeMonth } from '@/lib/office-time'
import { fetchAllRowsAsWritten } from '@/lib/paginate'
import { statementMonths, statementsMonth, statementsSummary } from '@/lib/billing-sheet'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import GenerateStatementsButton from '../_components/GenerateStatementsButton'
import StatementsPeriodTable from '../_components/StatementsPeriodTable'
import StatementsMonth from '../_components/StatementsMonth'
import FinSwitch from '../_components/FinSwitch'

// The monthly statements on the sheet (2026-10-07; the user approved the
// Invoice / Statements sample): four summary cards, then the month's table.
// Generating a statement and a statement's own page are as they were.
//
// ONE MONTH AT A TIME (2026-10-14, user: 在上面能够选择月份。我不要它把全部月份
// 的 statement 都挤在一个 tab): "← September 2026 ▾ →" at the head picks the
// month (?period=YYYY-MM), its grid dotting the months that have statements;
// opened bare — the sidebar — it shows the newest of them. The first two cards,
// the table and the Excel / PDF are that month's; Draft and All statements
// stay every month's, so a draft left in another month still shows.

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const bare = (n: number) => formatMoney(n).replace('RM ', '')

interface Props {
  searchParams?: Promise<{ period?: string }>
}

export default async function MonthlyStatementsPage({ searchParams }: Props) {
  await requirePage('/statements/monthly')
  const user = await requirePermission('treasury')
  const supabase = await createClient()
  const { period: asked } = (await searchParams) ?? {}

  // Every month's statements (a few rows a month): the month grid's dots and
  // the Draft / All statements cards need them all, the table its month.
  const [statementList, { data: companies }] = await Promise.all([
    fetchAllRowsAsWritten((page) => {
      const q = supabase
        .from('monthly_statements')
        .select('id, period_month, company_id, status, total_invoice, total_contra, net_amount, created_at')
        .order('period_month', { ascending: false })
        .order('created_at', { ascending: false })
      return page ? q.order('id').range(page.from, page.to) : q
    }, 'monthly_statements'),
    supabase.from('companies').select('id, name, short_code'),
  ])

  const companyMap = new Map(
    (companies ?? []).map((c) => [c.id, { name: c.name, code: c.short_code }])
  )

  const months = statementMonths(statementList)
  const month = statementsMonth(asked, months, officeMonth())
  const shown = statementList.filter((s) => String(s.period_month).slice(0, 7) === month)
  const summary = statementsSummary(statementList, month)
  const monthLabel = dayjs(`${month}-01`).format('MMMM YYYY')
  const monthName = dayjs(`${month}-01`).format('MMMM')
  // The grid's dots: each month that has statements, and how many.
  const marked: Record<string, string> = {}
  for (const m of months) marked[m] = plural(statementList.filter((s) => String(s.period_month).slice(0, 7) === m).length, 'statement', 'statements')
  // Generating raises the month's statements: Treasury · Create (2026-10-08, PR2).
  const canGenerate = canDo(user, 'treasury', 'create')
  const exportHref = (format: 'xlsx' | 'pdf') => `/statements/monthly/export?format=${format}&period=${month}`

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
          {/* The month first, as on Service Billing's head (2026-10-14). */}
          <StatementsMonth month={month} marked={marked} />
          {/* The handoff's order on the Finance view (2026-10-10): Excel, PDF,
              then Generate statements — the primary — last. */}
          <FinSwitch
            fin={
              <>
                <Link href={exportHref('xlsx')} className="btn-quiet-sheet">
                  Excel
                </Link>
                <Link href={exportHref('pdf')} className="btn-quiet-sheet">
                  PDF
                </Link>
                {canGenerate ? <GenerateStatementsButton month={month} /> : null}
              </>
            }
            other={
              <>
                {canGenerate ? <GenerateStatementsButton month={month} /> : null}
                <Link href={exportHref('xlsx')} className="btn-quiet-sheet">
                  Excel
                </Link>
                <Link href={exportHref('pdf')} className="btn-quiet-sheet">
                  PDF
                </Link>
              </>
            }
          />
        </div>
      </div>

      {/* ───────── Summary cards ───────── */}
      <StatCards label="Statements">
        <StatCard
          tone="primary"
          label={`Statements · ${monthName}`}
          value={String(summary.count)}
          icon="calendar"
          note={summary.count > 0 ? statusMix(shown).toLowerCase() : 'None generated'}
        />
        <StatCard
          label={`Net · ${monthName}`}
          value={formatMoney(summary.net)}
          icon="swap"
          note={summary.count > 0 ? `invoice ${bare(summary.invoice)} − contra ${bare(summary.contra)}` : '—'}
        />
        {/* Every month's: a draft waits on Finance itself, so it rests in the
            default tone (2026-10-09, the handoff). */}
        <StatCard
          label="Draft"
          value={String(summary.draft)}
          icon="clock"
          note={summary.draft > 0 ? `waiting to be issued${summary.draftMonths > 1 ? ` · ${summary.draftMonths} months` : ''}` : 'none waiting'}
        />
        <StatCard
          label="All statements"
          value={String(summary.total)}
          icon="layers"
          note={`${summary.issued} issued · ${summary.paid} paid`}
        />
      </StatCards>

      {/* ───────── The month's statements ───────── */}
      {statementList.length === 0 ? (
        <EmptyState canGenerate={canGenerate} />
      ) : shown.length === 0 ? (
        <MonthEmpty label={monthLabel} newest={months[0]} />
      ) : (
        <section className="mb-12">
          <div className="sect-head">
            <h2>{monthLabel}</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {shown.length} {shown.length === 1 ? 'STATEMENT' : 'STATEMENTS'} · {statusMix(shown)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <StatementsPeriodTable
              canSetDefault={canGenerate}
              rows={shown.map((s) => {
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

/** A month with none, while others have some: the way to the newest of them. */
function MonthEmpty({ label, newest }: { label: string; newest: string | undefined }) {
  return (
    <div className="py-16 text-center border border-hairline rounded-md bg-surface">
      <p className="font-serif italic text-graphite text-lg mb-4">No statements for {label}.</p>
      {newest ? (
        <Link href={`/statements/monthly?period=${newest}`} className="btn-quiet-sheet" title="The newest month with statements">
          {dayjs(`${newest}-01`).format('MMMM YYYY')} →
        </Link>
      ) : null}
    </div>
  )
}
