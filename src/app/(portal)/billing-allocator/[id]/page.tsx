import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import AllocationPage from './_components/AllocationPage'
import { loadAllocationPage } from './_lib/allocation-page'

// An allocation's own page (2026-10-09; 2026-10-14, the Finance revamp v2 —
// the drawer's *View full page ↗*, drawn as D06 draws a record's full page):
// the way back and the crumb, the number with billed / to bill and four facts,
// then the numbered cards — the expense, the split by company, the audit log
// (`audit_changes()`, what this reader's permissions open) — beside the dark
// panel: the split, and what Finance may do to it now. The reads are
// `loadAllocationPage`'s — the Finance phone app's record reads them too.

interface Props {
  params: Promise<{ id: string }>
}

export default async function AllocationRecordPage({ params }: Props) {
  await requirePage('/billing-allocator/[id]')
  const user = await requirePermission('billing')
  const { id } = await params
  // alloc_* tables aren't in the generated database.types yet — untyped client,
  // same convention as the list page; shapes narrowed manually in the read.
  const supabase = (await createClient()) as unknown as SupabaseClient

  const allocation = await loadAllocationPage(supabase, id)
  if (!allocation) notFound()

  return <AllocationPage allocation={allocation} can={{ create: canDo(user, 'billing', 'create'), edit: canDo(user, 'billing', 'edit') }} />
}
