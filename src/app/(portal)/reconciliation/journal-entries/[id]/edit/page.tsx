import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import JournalVoucherForm from '../../_components/JournalVoucherForm'

export default async function EditJournalVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireRole(['principal', 'finance'])
  const { id } = await params
  const supabase = await createClient()

  const [{ data: entry }, { data: lineRows }, { data: acctRows }] = await Promise.all([
    supabase.from('journal_entries').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('journal_lines')
      .select('account_code, debit, credit, description')
      .eq('entry_id', id)
      .order('created_at'),
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, parent_code')
      .eq('is_active', true)
      .order('code'),
  ])

  // Manual vouchers AND the auto payroll accruals are editable here (user
  // 2026-08-07: "万一有错我还可以更改"); other auto-posted entries (payments,
  // repayments, etc.) stay untouchable through this form.
  if (!entry || !['manual_jv', 'payroll_accrual'].includes(entry.reference_type as string)) {
    notFound()
  }

  // Full rows for AccountPicker — it hides header accounts itself and gives
  // type-ahead search (user 2026-06-12).
  const leafAccounts = (acctRows ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type,
    parent_code: (r as { parent_code: string | null }).parent_code ?? null,
    is_active: true,
  }))

  const formEntry = {
    id: entry.id,
    transaction_date: entry.transaction_date,
    description: entry.description,
    segment: (entry.segment as string) ?? 'unallocated',
    lines: (lineRows ?? []).map((l) => ({
      account_code: l.account_code,
      debit: l.debit != null ? Number(l.debit) : null,
      credit: l.credit != null ? Number(l.credit) : null,
      description: l.description,
    })),
  }

  return (
    <div>
      <Link
        href="/reconciliation/journal-entries"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Journal Entries
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · EDIT VOUCHER
          </div>
          <h1 className="page-title">{entry.entry_no}</h1>
        </div>
      </div>

      <JournalVoucherForm accounts={leafAccounts} entry={formEntry} />
    </div>
  )
}
