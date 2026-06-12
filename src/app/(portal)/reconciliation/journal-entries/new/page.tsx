import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import JournalVoucherForm from '../_components/JournalVoucherForm'

export default async function NewJournalVoucherPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

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
            <em>I.</em> TREASURY · NEW VOUCHER
          </div>
          <h1 className="page-title">New journal entry</h1>
        </div>
      </div>

      <JournalVoucherForm accounts={leafAccounts} />
    </div>
  )
}
