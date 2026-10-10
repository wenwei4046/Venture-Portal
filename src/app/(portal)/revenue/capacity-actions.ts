'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { adminMemberAction } from '@/lib/member/server'
import { capacityRefusal } from '@/lib/commission/capacity'
import { loadSubDepartmentCapacity, type CapacityRead } from './_lib/capacity'

/**
 * Rules › Capacity's Save (2026-10-10, the HR revamp): the headcount limit
 * moved here from Member services, and is still written by the member back
 * office's own RPC (`member_admin_action('set_capacity')`, which asks
 * `member_is_manager` again) — so the gate here is the one Member services,
 * Brand weeks and Claim rates ask. The figures are read with the page
 * (`_lib/capacity.ts`); after a save the fresh ones come back with the answer.
 *
 * Refusals come back as `{ ok: false, reason }`: a thrown message never
 * reaches the browser in production.
 */
export async function saveSubDepartmentCapacity(subDepartmentId: string, capacity: string): Promise<CapacityRead> {
  const user = await requireAuth()
  if (!user.permissions.includes('member_requests_manage')) return { ok: false, reason: 'Capacity needs HR request management access.' }
  const now = await loadSubDepartmentCapacity(subDepartmentId)
  if (!now.ok) return now
  const refused = capacityRefusal(capacity, now.data)
  if (refused) return { ok: false, reason: refused }
  const saved = await adminMemberAction({ action: 'set_capacity', subDepartmentId, capacity: Number(capacity.trim()) })
  if (!saved.ok) return { ok: false, reason: saved.error }
  revalidatePath('/member')
  revalidatePath('/member-admin')
  revalidatePath('/revenue', 'layout')
  return loadSubDepartmentCapacity(subDepartmentId)
}
