import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import DetailGroups from '@/components/sheet/DetailGroups'
import ReturnLink from '@/components/layout/ReturnLink'
import StatementSteps from './_components/StatementSteps'
import { readStatement, statementCategory } from '../_lib/statement-read'

// A statement's page on the Finance view (2026-10-09, the user's Claude Design
// handoff): the company as the title with its status chip, three cards — the
// net as the primary, the two subtotals — the invoice items and the contra
// items as two tables, the net summary in groups, and the one action its
// status allows. "← Back to Statements" is Back when the list is where the
// reader came from, so the list keeps its place.

interface Props {
  params: Promise<{ id: string }>
}

export default async function StatementDetailPage({ params }: Props) {
  await requirePage('/statements/[id]')
  const user = await requirePermission('treasury')
  const { id } = await params
  const supabase = await createClient()

  // The statement and its lines — as the Finance phone app reads them (`_lib/statement-read`).
  const read = await readStatement(supabase, id)
  if (!read) notFound()
  const { statement, company, invoiceLines, contraLines } = read
  const totalInvoice = Number(statement.total_invoice)
  const totalContra = Number(statement.total_contra)
  const net = Number(statement.net_amount)
  const companyName = company?.name ?? '—'
  const period = dayjs(statement.period_month).format('MMMM YYYY')
  // The list shows one month at a time (2026-10-14): back to this one's. The
  // sidebar's bare /statements/monthly, where its newest month showed, counts
  // as where the reader came from too.
  const listHref = `/statements/monthly?period=${dayjs(statement.period_month).format('YYYY-MM')}`
  const direction = net >= 0 ? `${companyName} pays HV` : `HV owes ${companyName}`

  // Issue and Mark paid move the statement along: Treasury · Edit (2026-10-08, PR2).
  const canFinanceAct = canDo(user, 'treasury', 'edit')
  const isDraft = statement.status === 'draft'
  const isIssued = statement.status === 'issued'
  const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href={listHref} alsoFrom={['/statements/monthly']} className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Back to Statements
        </ReturnLink>
      </div>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · STATEMENT · {period.toUpperCase()}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{companyName}</h1>
            <StatementStatus status={statement.status} />
          </div>
          <p className="font-sans text-xs text-graphite mt-2">
            {company?.short_code ? `${company.short_code} · ` : ''}Created {officeTime(statement.created_at).format('D MMMM YYYY')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/statements/${id}/print`} target="_blank" className="btn-quiet-sheet">
            Print Statement
          </Link>
        </div>
      </div>

      {/* ───────── Cards ───────── */}
      <StatCards label="Statement">
        <StatCard tone="primary" label="Net amount" value={formatMoney(net)} icon="receipt" note={direction} />
        <StatCard label="Subtotal invoice" value={formatMoney(totalInvoice)} icon="coin" note={items(invoiceLines.length)} />
        <StatCard label="Subtotal contra" value={formatMoney(-totalContra)} icon="swap" note={contraLines.length > 0 ? items(contraLines.length) : 'None'} />
      </StatCards>

      {/* ───────── Invoice items ───────── */}
      <LineSection
        title="Invoice items"
        count={`${items(invoiceLines.length).toUpperCase()} · ${formatMoney(totalInvoice)}`}
        lines={invoiceLines.map((l) => ({ id: l.id, category: statementCategory(l.category_code), description: l.description, amount: Number(l.amount) }))}
        footLabel="Subtotal invoice"
        footAmount={totalInvoice}
        empty="No invoice items for this period. Finance generates invoices on Service Billing before regenerating statements to pick them up."
      />

      {/* ───────── Contra items ───────── */}
      <LineSection
        title="Contra items"
        count={`${items(contraLines.length).toUpperCase()} · ${formatMoney(-totalContra)}`}
        lines={contraLines.map((l) => ({ id: l.id, category: statementCategory(l.category_code), description: l.description, amount: -Number(l.amount) }))}
        footLabel="Subtotal contra"
        footAmount={-totalContra}
        empty="No contra items. Savings interest and loan repayments (via netting) would appear here."
      />

      {/* ───────── Net summary ───────── */}
      <DetailGroups
        title="Net summary"
        count={direction.toUpperCase()}
        groups={[
          {
            title: 'Summary',
            items: [
              { label: 'Subtotal invoice', value: formatMoney(totalInvoice) },
              { label: 'Subtotal contra', value: formatMoney(-totalContra) },
              { label: 'Net payable', value: <span className={net < 0 ? 'text-danger' : undefined}>{formatMoney(net)}</span> },
            ],
          },
        ]}
      />

      {/* ───────── Actions ───────── */}
      {canFinanceAct && (isDraft || isIssued) ? (
        <section className="mb-6">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">FINANCE ONLY · ISSUED STATEMENTS LOCK</span>
          </div>
          <div className="fin-actions">
            {/* Each asks first — neither is taken back (2026-10-16). */}
            <StatementSteps id={statement.id} company={companyName} period={period} net={formatMoney(net)} step={isDraft ? 'issue' : 'paid'} />
            {isIssued ? (
              <span className="note">
                {statement.issued_at ? `Issued ${officeTime(statement.issued_at).format('D MMM YYYY HH:mm')}` : 'Issued.'}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function LineSection({
  title,
  count,
  lines,
  footLabel,
  footAmount,
  empty,
}: {
  title: string
  count: string
  lines: Array<{ id: string; category: string; description: string | null; amount: number }>
  footLabel: string
  footAmount: number
  empty: string
}) {
  return (
    <section className="mb-9">
      <div className="sect-head">
        <h2>{title}</h2>
        <span className="rule" aria-hidden />
        <span className="count">{count}</span>
      </div>
      {lines.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-5 text-center">
          <p className="font-sans text-sm text-graphite">{empty}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ledger-table w-full">
            <thead>
              <tr>
                <th>Category</th>
                <th className="m-hide">Description</th>
                <th className="text-right right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.category}</td>
                  <td className="m-hide text-graphite">{line.description ?? <span className="text-muted">—</span>}</td>
                  <td className={`num${line.amount < 0 ? ' neg' : ''}`}>{formatMoney(line.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{footLabel}</td>
                <td className={`num${footAmount < 0 ? ' neg' : ''}`}>{formatMoney(footAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

/** The statement's status as the sheet's chip: issued waits, paid is done. */
function StatementStatus({ status }: { status: string }) {
  const tone = status === 'issued' ? ' alert' : status === 'paid' ? ' ledger' : ''
  return (
    <span className={`chip lg${tone}`}>
      <i className="dot" />
      {status}
    </span>
  )
}
