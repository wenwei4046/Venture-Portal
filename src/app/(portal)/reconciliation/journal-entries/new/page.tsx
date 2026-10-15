import Link from 'next/link'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import JournalVoucherForm from '../_components/JournalVoucherForm'
import { readJvAccounts, readJvPrefill } from '../_lib/jv-read'

export default async function NewJournalVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  await requirePage('/reconciliation/journal-entries/new')
  await requireActionOn('/reconciliation/journal-entries/new', 'reconciliation', 'create')
  const supabase = await createClient()
  const { from } = await searchParams

  // The accounts and, to copy one (?from=<entry id>), a voucher's words and lines (`../_lib/jv-read` — the
  // Finance phone app's read too). Copy mode: nothing posts until the user hits "Post voucher" — JVs post on
  // creation (GL + bank/pool sync), so an instant-duplicate Copy would be dangerous; a prefilled draft form is
  // the safe shape.
  const [leafAccounts, prefill] = await Promise.all([readJvAccounts(supabase), from ? readJvPrefill(supabase, from) : Promise.resolve(undefined)])

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
        </div>
      </div>

      <JournalVoucherForm accounts={leafAccounts} prefill={prefill} />
    </div>
  )
}
