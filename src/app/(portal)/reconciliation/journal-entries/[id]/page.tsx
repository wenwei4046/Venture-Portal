import Link from 'next/link'
import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import ReturnLink from '@/components/layout/ReturnLink'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import JvDeleteButton from './_components/JvDeleteButton'
import { readJournalVoucher } from '../_lib/jv-read'

// A journal voucher's own page (2026-10-09, the user's Claude Design handoff —
// "Journal list → detail page"): its number with a chip (posted, or auto ·
// payroll for the payroll accrual), the description, Date / Segment / Amount
// cards, the lines closing on their totals, and what may be done with it —
// Delete / Copy / Edit, or Fix mistakes for an auto accrual (both through the
// voucher form, as before).

const r2 = (n: number) => Math.round(n * 100) / 100

export default async function JournalVoucherPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage('/reconciliation/journal-entries/[id]')
  const user = await requirePermission('reconciliation')
  const canCreate = canDo(user, 'reconciliation', 'create')
  const canEdit = canDo(user, 'reconciliation', 'edit')
  const { id } = await params
  const supabase = await createClient()

  // The voucher, its lines and its accounts' names (`../_lib/jv-read` — the Finance phone app's read too).
  const read = await readJournalVoucher(supabase, id)
  if (!read) notFound()
  const { entry, lines, nameOf } = read!

  const auto = entry!.reference_type === 'payroll_accrual'
  const dr = r2(lines.reduce((s, l) => s + Number(l.debit ?? 0), 0))
  const cr = r2(lines.reduce((s, l) => s + Number(l.credit ?? 0), 0))
  const segment = ((entry!.segment as string | null) ?? 'unallocated').replace(/_/g, ' ')

  return (
    <div>
      <div className="mb-3">
        <ReturnLink href="/reconciliation/journal-entries" className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Journal Entries
        </ReturnLink>
      </div>

      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · JOURNAL VOUCHER{auto ? ' · AUTO' : ''}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{entry!.entry_no}</h1>
            <span className={`chip ${auto ? 'info' : 'ledger'}`}>
              <span className="dot" />
              {auto ? 'auto · payroll' : 'posted'}
            </span>
          </div>
          {entry!.description ? <p className="page-sub">{entry!.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {auto ? (
            canEdit ? (
              <Link href={`/reconciliation/journal-entries/${entry!.id}/edit`} className="btn-quiet-sheet">
                Fix mistakes
              </Link>
            ) : null
          ) : (
            <>
              {canEdit ? <JvDeleteButton id={entry!.id as string} entryNo={entry!.entry_no as string | null} /> : null}
              {canCreate ? (
                <Link href={`/reconciliation/journal-entries/new?from=${entry!.id}`} className="btn-quiet-sheet">
                  Copy
                </Link>
              ) : null}
              {canEdit ? (
                <Link href={`/reconciliation/journal-entries/${entry!.id}/edit`} className="btn-pri-sheet">
                  Edit
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      <StatCards label="Journal voucher">
        <StatCard label="Date" value={dayjs(entry!.transaction_date as string).format('DD MMM YYYY')} icon="calendar" note="Posting date" />
        <StatCard label="Segment" value={segment.replace(/^./, (c) => c.toUpperCase())} icon="layers" note="gl_segment" />
        <StatCard
          label="Amount"
          value={formatMoney(dr)}
          icon="swap"
          tone="primary"
          note={Math.abs(dr - cr) < 0.005 ? 'Balanced · debits = credits' : `Out of balance · ${formatMoneyBare(Math.abs(r2(dr - cr)))}`}
        />
      </StatCards>

      <section className="mb-6">
        <div className="sect-head">
          <h2>Lines</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {lines.length} {lines.length === 1 ? 'LINE' : 'LINES'}
          </span>
        </div>
        <div className="table-frame">
          <div className="table-frame-scroll">
            <table className="ledger-table [&_td.num]:whitespace-nowrap">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="right">Debit</th>
                  <th className="right">Credit</th>
                  <th>Line note</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.account_code}
                      {nameOf.get(l.account_code) ? ` · ${nameOf.get(l.account_code)}` : ''}
                    </td>
                    <td className="num">{Number(l.debit ?? 0) > 0 ? formatMoneyBare(Number(l.debit)) : '—'}</td>
                    <td className="num">{Number(l.credit ?? 0) > 0 ? formatMoneyBare(Number(l.credit)) : '—'}</td>
                    <td className="text-graphite">{l.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{formatMoneyBare(dr)}</td>
                  <td className="num">{formatMoneyBare(cr)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
