import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { readReconHub } from '@/app/(portal)/reconciliation/_lib/recon-read'
import { openReconSession } from '@/app/(portal)/reconciliation/page-actions'
import { reconHubModel } from '@/lib/fin-app/recon-model'
import { shiftMonth } from '@/lib/fin-app/page-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import ReconApp from '@/components/fin-app/ReconApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/recon` — Daily › Reconciliation in the Finance phone app
 * (2026-10-15, part 5c): the page's own gates (its tabs, Reconciliation), each
 * bank against the GL and the saved months the desktop page reads
 * (`readReconHub`), and — a link or a refresh landing on a month (`?id=`) —
 * that month read with the page.
 */
export default async function FinAppReconciliation({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reconciliation')
  const user = await requirePermission('reconciliation')
  const sp = await searchParams
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = (await createClient()) as unknown as SupabaseClient
  const [{ banks, sessions }, read] = await Promise.all([readReconHub(supabase), id ? openReconSession(id) : Promise.resolve(null)])
  return (
    <ReconApp
      hub={reconHubModel(banks, sessions)}
      search={searchOf(sp)}
      banks={banks.map((b) => ({ id: b.id, label: `${b.bank_name}${b.account_number ? ` — ${b.account_number}` : ''}` }))}
      defaultMonth={shiftMonth(officeMonth(), -1)}
      may={{ create: canDo(user, 'reconciliation', 'create') }}
      record={read && read.ok ? read.record : null}
      refused={read && !read.ok ? read.reason : null}
    />
  )
}
