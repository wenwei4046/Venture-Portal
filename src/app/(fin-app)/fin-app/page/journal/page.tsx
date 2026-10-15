import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { readJournalList } from '@/app/(portal)/reconciliation/journal-entries/_lib/jv-read'
import { openJournalVoucher } from '@/app/(portal)/reconciliation/journal-entries/page-actions'
import { journalHubModel } from '@/lib/fin-app/journal-model'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import JournalApp from '@/components/fin-app/JournalApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/journal` — Daily › Journal Entries in the Finance phone app
 * (2026-10-15, part 5c): the list's own gates (its tabs, Reconciliation), the
 * vouchers the desktop list reads (`readJournalList`), and — a link or a
 * refresh landing on a voucher (`?id=`) — that voucher read with the page.
 */
export default async function FinAppJournal({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reconciliation/journal-entries')
  const user = await requirePermission('reconciliation')
  const sp = await searchParams
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = await createClient()
  const [rows, read] = await Promise.all([readJournalList(supabase), id ? openJournalVoucher(id) : Promise.resolve(null)])
  // The departments added since the voucher form's list (IT, Revenue Department …), named from the registry this request primed.
  const extra = extraReportSegments(primedRegistryRows()).map((x) => ({ value: x.value, label: x.label }))
  return (
    <JournalApp
      hub={journalHubModel(rows ?? [], officeMonth(), extra)}
      extraSegments={extra}
      search={searchOf(sp)}
      today={officeToday()}
      canCreate={canDo(user, 'reconciliation', 'create')}
      record={read && read.ok ? read.record : null}
      refused={read && !read.ok ? read.reason : null}
    />
  )
}
