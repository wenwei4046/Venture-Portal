'use server'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { opensPage } from '@/lib/page-tabs'
import { loadInvoicePage, type InvoicePageData } from '@/app/(portal)/invoices/[id]/_lib/invoice-page'

/**
 * An invoice as the Finance phone app's record screen opens it (2026-10-15 —
 * M10–M11): on a phone that screen IS the invoice's page, so it reads what the
 * full page reads (`loadInvoicePage` — the invoice as the hub reads it, the
 * trail, the audit log, what its dialogs offer), behind the same gates: Billing,
 * and Invoice's tabs (the hub's and the full page's are one). Answered in
 * words, never thrown — production reduces a thrown message to a digest.
 */
export async function openInvoicePage(id: string): Promise<{ ok: true; page: InvoicePageData } | { ok: false; reason: string }> {
  const user = await requirePermission('billing')
  if (!opensPage(user.tabs, '/invoices/[id]')) return { ok: false, reason: 'Invoices are not open to you.' }
  const supabase = await createClient()
  const page = await loadInvoicePage(supabase, id)
  if (!page) return { ok: false, reason: 'This invoice is not there any more.' }
  return { ok: true, page }
}
