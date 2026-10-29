import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { parseRequests } from '@/lib/payment-requests/model'
import ClaimHub from './_components/ClaimHub'

export const dynamic = 'force-dynamic'

/**
 * Claim (2026-10-29, PR ② of docs/module-spec-payment-requests.md — the claim process the user settled with the boss):
 * one's own payment requests — a claim ("I paid — pay me back") or a direct payment to a supplier — sent to Finance,
 * who makes the voucher on Payments › Payment request. In every view (each view's own row); the pool claims this page
 * listed before stay in the database until PR ⑥ retires them. Viewing as somebody shows none of the real account's.
 */
export default async function ClaimPage() {
  await requirePage('/claims')
  const user = await requirePermission('claims')
  const canCreate = canDo(user, 'claims', 'create', 'own')
  if (user.viewingAs) return <ClaimHub rows={[]} canCreate={false} viewingAs readError={null} />

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_payment_requests')
  return (
    <ClaimHub
      rows={parseRequests(data)}
      canCreate={canCreate}
      viewingAs={false}
      readError={error ? (error.code === '42501' ? error.message : 'Your requests could not be read. Reload the page.') : null}
    />
  )
}
