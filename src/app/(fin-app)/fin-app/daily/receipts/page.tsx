import { requirePage, requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canDo } from '@/lib/permission-actions'
import { officeMonth, officeToday } from '@/lib/office-time'
import { loadHubLedger } from '@/app/(portal)/payments/_lib/hub-ledger'
import { openVoucherPage } from '@/app/(portal)/payments/page-actions'
import { REFUSED } from '@/app/(portal)/payments/_lib/voucher-refusals'
import VoucherApp from '@/components/fin-app/VoucherApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/daily/receipts` — Daily › Receive in the Finance phone app
 * (2026-10-15, M09): Receipt's own page asked first, the ledger's credit side
 * (Receipt's hub's read), Create receipt and Loan repayment received, and a
 * receipt the address names read with the page.
 */
export default async function FinAppReceipts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/receipts')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = await createClient()
  const [ledger, read] = await Promise.all([loadHubLedger(supabase, user, 'credit', {}), id ? openVoucherPage(id) : Promise.resolve(null)])
  return (
    <VoucherApp
      hub="receipts"
      search={search}
      ledger={ledger}
      record={read && read.ok ? { detail: read.detail, extras: read.extras, canCopy: read.canCopy } : null}
      refused={read && !read.ok ? REFUSED[read.reason] : null}
      canCreate={canDo(user, 'treasury', 'create')}
      prefix={`HV-OR-${officeMonth().replace('-', '')}`}
      today={officeToday()}
    />
  )
}
