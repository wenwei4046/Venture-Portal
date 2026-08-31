import Link from 'next/link'
import { notFound } from 'next/navigation'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { issueStatement, markStatementPaid } from '../actions'

interface Props {
  params: Promise<{ id: string }>
}

export default async function StatementDetailPage({ params }: Props) {
  const user = await requireRole(['principal', 'finance'])
  const { id } = await params
  const supabase = await createClient()

  const { data: statement, error } = await supabase
    .from('monthly_statements')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !statement) notFound()

  const [{ data: company }, { data: lines }] = await Promise.all([
    supabase
      .from('companies')
      .select('name, short_code')
      .eq('id', statement.company_id)
      .single(),
    supabase
      .from('monthly_statement_lines')
      .select('*')
      .eq('statement_id', statement.id)
      .order('line_type')
      .order('created_at'),
  ])

  const lineList = lines ?? []
  const invoiceLines = lineList.filter((l) => l.line_type === 'invoice')
  const contraLines = lineList.filter((l) => l.line_type === 'contra')

  const canFinanceAct = user.role === 'finance' || user.role === 'principal'
  const isDraft = statement.status === 'draft'
  const isIssued = statement.status === 'issued'

  return (
    <div>
      <Link
        href="/statements/monthly"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Statements
      </Link>

      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · STATEMENT · {dayjs(statement.period_month).format('MMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">{company?.name ?? '—'}</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            {company?.short_code} · Created <em>{dayjs(statement.created_at).format('D MMMM YYYY')}</em>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/statements/${id}/print`}
            target="_blank"
            className="btn-secondary"
          >
            Print Statement
          </Link>
          <StatementStatus status={statement.status} />
        </div>
      </div>

      {/* ───────── Hero net amount ───────── */}
      <div className="mb-12 pb-12 border-b border-hairline">
        <div className="font-serif italic text-accent text-base mb-1">
          Net amount
        </div>
        <div className={`font-serif text-[30px] sm:text-[44px] md:text-hero leading-none tabular tracking-[-0.01em] ${Number(statement.net_amount) < 0 ? 'text-danger' : 'text-num-ink'}`}>
          {formatMoney(Number(statement.net_amount))}
        </div>
        <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em] font-medium">
          {Number(statement.net_amount) >= 0 ? (
            <>
              {(company?.name ?? '—').toUpperCase()} <em className="font-serif italic normal-case text-graphite">pays HV</em>
            </>
          ) : (
            <>
              HV <em className="font-serif italic normal-case text-graphite">owes</em> {(company?.name ?? '—').toUpperCase()}
            </>
          )}
        </div>
      </div>

      {/* ───────── Invoice items ───────── */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>Invoice items</h2>
          <span className="rule" aria-hidden />
          <span className="count">{invoiceLines.length} ITEM{invoiceLines.length === 1 ? '' : 'S'} · <span className="num">{formatMoney(Number(statement.total_invoice))}</span></span>
        </div>
        {invoiceLines.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-5 text-center">
            <p className="font-serif italic text-muted text-sm">
              No invoice items for this period. Finance generates invoices via <em>/billing</em>
              before regenerating statements to pick them up.
            </p>
          </div>
        ) : (
          <div className="border-t border-hairline">
            {invoiceLines.map((line) => (
              <div
                key={line.id}
                className="py-3 border-b border-hairline last:border-0 flex items-baseline justify-between"
              >
                <div>
                  <div className="font-serif text-md text-ink">
                    {formatCategory(line.category_code)}
                  </div>
                  {line.description ? (
                    <div className="font-serif italic text-muted text-xs">
                      {line.description}
                    </div>
                  ) : null}
                </div>
                <span className="num">
                  {formatMoney(Number(line.amount))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ───────── Contra items ───────── */}
      <section className="mb-10">
        <div className="sect-head">
          <h2>Contra items</h2>
          <span className="rule" aria-hidden />
          <span className="count">{contraLines.length} ITEM{contraLines.length === 1 ? '' : 'S'} · <span className="num neg">{formatMoney(-Number(statement.total_contra))}</span></span>
        </div>
        {contraLines.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-5 text-center">
            <p className="font-serif italic text-muted text-sm">
              No contra items. Savings interest and loan repayments (via netting) would
              appear here.
            </p>
          </div>
        ) : (
          <div className="border-t border-hairline">
            {contraLines.map((line) => (
              <div
                key={line.id}
                className="py-3 border-b border-hairline last:border-0 flex items-baseline justify-between"
              >
                <div>
                  <div className="font-serif text-md text-ink">
                    {formatCategory(line.category_code)}
                  </div>
                  {line.description ? (
                    <div className="font-serif italic text-muted text-xs">
                      {line.description}
                    </div>
                  ) : null}
                </div>
                <span className="num neg">
                  {formatMoney(-Number(line.amount))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ───────── Final net summary ───────── */}
      <div className="bg-surface border border-hairline rounded-md p-5 mb-10 max-w-md ml-auto">
        <div className="flex justify-between font-mono text-sm text-graphite mb-1">
          <span>Subtotal invoice</span>
          <span className="num">
            {formatMoney(Number(statement.total_invoice))}
          </span>
        </div>
        <div className="flex justify-between font-mono text-sm text-graphite mb-2 pb-2 border-b border-hairline">
          <span>Subtotal contra</span>
          <span className="num neg">
            {formatMoney(-Number(statement.total_contra))}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-serif italic text-md text-accent">Net payable</span>
          <span className={`font-serif text-2xl tabular tracking-[-0.01em] ${Number(statement.net_amount) < 0 ? 'text-danger' : 'text-num-ink'}`}>
            {formatMoney(Number(statement.net_amount))}
          </span>
        </div>
      </div>

      {/* ───────── Actions ───────── */}
      {canFinanceAct && (isDraft || isIssued) ? (
        <section className="border-t border-hairline pt-8">
          <div className="sect-head">
            <h2>Actions</h2>
            <span className="rule" aria-hidden />
            <span className="count">FINANCE ONLY · ISSUED STATEMENTS LOCK</span>
          </div>
          <div className="flex items-center gap-3">
            {isDraft ? (
              <form action={issueStatement}>
                <input type="hidden" name="id" value={statement.id} />
                <button
                  type="submit"
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
                >
                  Issue to subsidiary
                </button>
              </form>
            ) : null}
            {isIssued ? (
              <form action={markStatementPaid}>
                <input type="hidden" name="id" value={statement.id} />
                <button
                  type="submit"
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
                >
                  Mark as paid
                </button>
              </form>
            ) : null}
          </div>
          {statement.issued_at ? (
            <p className="font-mono text-xs text-muted mt-3">
              Issued {dayjs(statement.issued_at).format('D MMM YYYY HH:mm')}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function StatementStatus({ status }: { status: string }) {
  if (status === 'draft')
    return <span className="status-morph font-serif italic text-graphite text-md">draft</span>
  if (status === 'issued')
    return <span className="status-morph font-serif italic text-alert text-md">issued</span>
  if (status === 'paid')
    return <span className="status-morph font-serif italic text-ledger text-md">paid</span>
  return <span className="status-morph font-serif italic text-muted text-md">{status}</span>
}

function formatCategory(code: string): string {
  const labels: Record<string, string> = {
    hr_pool: 'HR Pool',
    finance_staff: 'Finance Staff',
    marketing_project: 'Marketing Project',
    rent: 'Rent',
    utility: 'Utility',
    loan_repayment: 'Loan Repayment',
    loan_interest: 'Loan Interest',
    loan_principal: 'Loan Principal',
    other: 'Other',
  }
  return labels[code] ?? code
}
