'use server'

import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { actionsOnPage, opensPage } from '@/lib/page-tabs'
import { loadVoucherDetail, type VoucherDetail } from './_lib/voucher-detail'

// The hub's drawer (2026-10-14, the Finance revamp v2 — D05): one voucher,
// read when its row is clicked. It asks what the voucher page asks — the
// treasury, a page of Payments' tabs open — and draws the buttons the
// voucher's own writes would let through (they name /payments/[id]).
// A refusal is an answer, not a throw: production hides a thrown message.

export type DrawerRefusal = 'closed' | 'not_found' | 'payroll'

export async function openVoucherDrawer(id: string): Promise<{ ok: true; detail: VoucherDetail } | { ok: false; reason: DrawerRefusal }> {
  const user = await requirePermission('treasury')
  if (!opensPage(user.tabs, '/payments') && !opensPage(user.tabs, '/payments/[id]')) return { ok: false, reason: 'closed' }
  const acting = user.closed?.length ? { ...user, actions: actionsOnPage(user.actions ?? {}, user.closed, '/payments/[id]') } : user
  const supabase = await createClient()
  return loadVoucherDetail(supabase, acting, id)
}
