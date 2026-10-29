import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { parseApproval, parseRequests, type ApprovalRead } from '@/lib/payment-requests/model'
import ClaimHub from './_components/ClaimHub'

export const dynamic = 'force-dynamic'

/**
 * Claim (2026-10-29, PR ② of docs/module-spec-payment-requests.md — the claim process the user settled with the boss):
 * one's own payment requests — a claim ("I paid — pay me back") or a direct payment to a supplier — sent to Finance,
 * who makes the voucher on Payments › Payment request. In every view (each view's own row); the pool claims this page
 * listed before stay in the database until PR ⑥ retires them. Viewing as somebody shows none of the real account's.
 * PR ③: for a Claim & approve holder (Claims · View at Dept) it is Claim & approve — their department's requests beside
 * their own; one whose department cannot be read keeps the Claim page.
 */
export default async function ClaimPage() {
  await requirePage('/claims')
  const user = await requirePermission('claims')
  const canCreate = canDo(user, 'claims', 'create', 'own')
  if (user.viewingAs) return <ClaimHub rows={[]} canCreate={false} viewingAs readError={null} />

  const supabase = await createClient()
  const holder = canDo(user, 'claims', 'view', 'dept')
  const [mine, dept] = await Promise.all([
    supabase.rpc('my_payment_requests'),
    holder ? supabase.rpc('payment_requests_for_approval') : Promise.resolve(null),
  ])
  const approval: ApprovalRead | null = dept && !dept.error ? parseApproval(dept.data) : null
  const { data, error } = mine
  return (
    <ClaimHub
      rows={parseRequests(data)}
      canCreate={canCreate}
      viewingAs={false}
      readError={error ? (error.code === '42501' ? error.message : 'Your requests could not be read. Reload the page.') : null}
      approval={approval}
      me={user.name ?? ''}
    />
  )
}
