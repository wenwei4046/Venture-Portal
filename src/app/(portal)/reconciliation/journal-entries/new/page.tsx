import Link from 'next/link'
import { requireAction, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import JournalVoucherForm from '../_components/JournalVoucherForm'

export default async function NewJournalVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  await requirePage('/reconciliation/journal-entries/new')
  await requireAction('reconciliation', 'create')
  const supabase = await createClient()
  const { from } = await searchParams

  const { data: acctRows } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type, parent_code')
    .eq('is_active', true)
    .order('code')

  // Full rows for AccountPicker — it hides header accounts itself and gives
  // type-ahead search (user 2026-06-12: JV 录科目要能打字快速找到).
  const leafAccounts = (acctRows ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    type: r.type,
    parent_code: (r as { parent_code: string | null }).parent_code ?? null,
    is_active: true,
  }))

  // Copy mode (?from=<entry id>): prefill the form from an existing manual
  // JV. Nothing posts until the user hits "Post voucher" — JVs post on
  // creation (GL + bank/pool sync), so an instant-duplicate Copy would be
  // dangerous; a prefilled draft form is the safe shape.
  let prefill:
    | {
        description: string
        segment: string
        lines: Array<{ account_code: string; debit: number | null; credit: number | null; description: string | null }>
      }
    | undefined
  if (from) {
    const [{ data: src }, { data: srcLines }] = await Promise.all([
      supabase.from('journal_entries').select('id, description, segment, reference_type').eq('id', from).maybeSingle(),
      supabase
        .from('journal_lines')
        .select('account_code, debit, credit, description')
        .eq('entry_id', from)
        .order('created_at'),
    ])
    if (src && ['manual_jv', 'payroll_accrual'].includes(src.reference_type as string)) {
      prefill = {
        description: src.description ?? '',
        segment: (src.segment as string) ?? 'unallocated',
        lines: (srcLines ?? []).map((l) => ({
          account_code: l.account_code,
          debit: l.debit != null ? Number(l.debit) : null,
          credit: l.credit != null ? Number(l.credit) : null,
          description: l.description,
        })),
      }
    }
  }

  return (
    <div>
      <div className="mb-3">
        <Link href="/reconciliation/journal-entries" className="text-[13px] text-graphite hover:text-ink font-sans transition-colors">
          ← Journal Entries
        </Link>
      </div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · MANUAL VOUCHERS · {prefill ? 'COPY' : 'NEW'}
          </div>
          <h1 className="page-title">{prefill ? 'Copy Journal Voucher' : 'New Journal Voucher'}</h1>
          <p className="page-sub">Debits must equal credits. Press Ins to add a line.</p>
        </div>
      </div>

      <JournalVoucherForm accounts={leafAccounts} prefill={prefill} />
    </div>
  )
}
