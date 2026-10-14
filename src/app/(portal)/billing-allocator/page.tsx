import { officeMonth } from '@/lib/office-time'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import AllocatorHub, { type AllocatorCard } from './_components/AllocatorHub'
import { loadAllocatorData } from './_lib/allocator-data'

// Inter-company Billing Allocator (port of the user's Apps Script tool).
// HV pays a shared expense → allocate to subsidiaries by headcount /
// percentage / equal / custom → save → raise one DRAFT invoice per company
// through the same path as manual multi-line invoices.
//
// 2026-10-14 — the Finance revamp v2 (D11): the design's hub for every reader
// of it (AllocatorHub) — Records, By company, Staff, Setup as cards beside
// the list, a record in the drawer, + New allocation in the drawer too. The
// month is read by `loadAllocatorData` — the Finance phone app's Billing reads it too.

interface Props {
  /** `edit` — a record's own page sent it back to be corrected (2026-10-09);
   *  `card` — the list on show (records, company, staff, setup). */
  searchParams: Promise<{ period?: string; edit?: string; card?: string }>
}

const CARDS: ReadonlyArray<AllocatorCard> = ['records', 'company', 'staff', 'setup']

export default async function BillingAllocatorPage({ searchParams }: Props) {
  await requirePage('/billing-allocator')
  const user = await requirePermission('billing')
  // alloc_* tables aren't in the generated database.types yet — untyped client,
  // same convention as lib/cfo-reports.ts; shapes narrowed manually in the read.
  const supabase = (await createClient()) as unknown as SupabaseClient

  const sp = await searchParams
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? '') ? sp.period! : officeMonth()
  const data = await loadAllocatorData(supabase, period)

  // Each button asks what its action asks: + New allocation and Generate
  // invoices Billing · Create, the rest of the allocator's writes Billing ·
  // Edit — on this page's boxes, as requirePage narrowed them.
  return (
    <AllocatorHub
      key={period}
      data={data}
      can={{ create: canDo(user, 'billing', 'create'), edit: canDo(user, 'billing', 'edit') }}
      canSetDefault={canDo(user, 'billing', 'create')}
      thisMonth={officeMonth()}
      initialCard={CARDS.includes(sp.card as AllocatorCard) ? (sp.card as AllocatorCard) : 'records'}
      editId={sp.edit}
    />
  )
}
