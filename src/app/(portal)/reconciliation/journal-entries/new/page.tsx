import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import JournalVoucherForm from '../_components/JournalVoucherForm'

export default async function NewJournalVoucherPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { data: acctRows } = await supabase
    .from('chart_of_accounts')
    .select('code, name, parent_code')
    .eq('is_active', true)
    .order('code')

  const rows = acctRows ?? []
  // Leaves = codes that are NOT a parent_code of any other account. Posting is
  // only allowed to leaf accounts (a DB trigger rejects header accounts).
  const parentCodes = new Set(
    rows.map((r) => r.parent_code).filter((c): c is string => !!c)
  )
  const leafAccounts = rows
    .filter((r) => !parentCodes.has(r.code))
    .map((r) => ({ code: r.code, name: r.name }))

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
