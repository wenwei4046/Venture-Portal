'use server'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canDo } from '@/lib/permission-actions'
import { actionsOnPage, opensPage } from '@/lib/page-tabs'
import { loadVoucherDetail, type VoucherDetail } from './_lib/voucher-detail'
import { loadVoucherPageExtras, type VoucherPageExtras } from './_lib/voucher-page'
import type { DrawerRefusal } from './drawer-actions'

/**
 * A voucher as the Finance phone app's record screen opens it (2026-10-15 —
 * M04): on a phone that screen IS the voucher's page, so it reads what the
 * hub's drawer reads (`openVoucherDrawer` — the same gates: the treasury, a
 * page of Payments' or Receipt's tabs open, the buttons narrowed by
 * /payments/[id]'s boxes) and what the full page adds — whom it pays, the
 * statutory lines, the GL accounts it may be moved between, the audit log. A
 * receipt has no full page (the README), so no extras. Its own file, so the
 * drawer's never carries the full page's reads.
 */
export async function openVoucherPage(
  id: string,
): Promise<{ ok: true; detail: VoucherDetail; extras: VoucherPageExtras | null; canCopy: boolean } | { ok: false; reason: DrawerRefusal }> {
  const user = await requirePermission('treasury')
  if (!(['/payments', '/payments/[id]', '/receipts'] as const).some((p) => opensPage(user.tabs, p))) return { ok: false, reason: 'closed' }
  const acting = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/payments/[id]') } : user
  const supabase = await createClient()
  const read = await loadVoucherDetail(supabase, acting, id)
  if (!read.ok) return read
  const extras = read.detail.credit ? null : await loadVoucherPageExtras(supabase, acting, read.detail)
  return { ok: true, detail: read.detail, extras, canCopy: !read.detail.credit && canDo(acting, 'treasury', 'create') }
}
