import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { officeToday } from '@/lib/office-time'
import { loadPaymentsHub } from '@/app/(portal)/payments/_lib/payments-hub'
import { openVoucherPage } from '@/app/(portal)/payments/page-actions'
import { REFUSED } from '@/app/(portal)/payments/_lib/voucher-refusals'
import { readPaymentRequests } from '@/app/(portal)/payments/requests/_lib/requests-read'
import VoucherApp from '@/components/fin-app/VoucherApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/daily/payments` — Daily › Payment in the Finance phone app
 * (2026-10-15, M02–M08): Payments' own page asked first (its tabs, the
 * treasury), the desktop hub's reads (`loadPaymentsHub`), and — a link or a
 * refresh landing on a voucher (`?id=`) — that voucher read with the page, so
 * nothing is asked after the navigation (speed.md). Since PR ⑥ (2026-10-29) its
 * *Requests · N* counts what Payment request says waits for Finance (its read,
 * `readPaymentRequests` — a read that fails leaves the button without a number).
 */
export default async function FinAppPayments({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/payments')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  const id = typeof sp.id === 'string' ? sp.id : null
  const [hub, read, requests] = await Promise.all([
    loadPaymentsHub(user, {}),
    id ? openVoucherPage(id) : Promise.resolve(null),
    readPaymentRequests(user).catch(() => null),
  ])
  return (
    <VoucherApp
      hub="payments"
      search={search}
      ledger={hub.ledger}
      record={read && read.ok ? { detail: read.detail, extras: read.extras, canCopy: read.canCopy } : null}
      refused={read && !read.ok ? REFUSED[read.reason] : null}
      canCreate={hub.canCreate}
      canExport={canDo(user, 'treasury', 'export')}
      create={hub.create}
      today={officeToday()}
      requests={requests ? requests.rows.filter((r) => r.stage === 'finance').length : 0}
    />
  )
}
