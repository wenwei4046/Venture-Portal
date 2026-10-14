import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { loadInvoiceHub } from '@/app/(portal)/statements/_lib/invoice-hub'
import { openInvoicePage } from '@/app/(portal)/statements/page-actions'
import InvoiceApp from '@/components/fin-app/InvoiceApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/daily/invoices` — Daily › Invoice in the Finance phone app
 * (2026-10-15, M10–M11): Invoice's own page asked first (its tabs, Billing),
 * the desktop hub's read for the month the address names (`?m=YYYY-MM`, the
 * office's month without one), each button asking what its action asks, and —
 * a link or a refresh landing on an invoice (`?id=`) — that invoice's page read
 * with it, so nothing is asked after the navigation (speed.md).
 */
export default async function FinAppInvoices({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/statements')
  const user = await requirePermission('billing')
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  const thisMonth = officeMonth()
  const month = typeof sp.m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : thisMonth
  const id = typeof sp.id === 'string' ? sp.id : null
  const supabase = await createClient()
  const [hub, read] = await Promise.all([loadInvoiceHub(supabase, `${month}-01`), id ? openInvoicePage(id) : Promise.resolve(null)])
  return (
    <InvoiceApp
      key={hub.period}
      hub={hub}
      can={{
        create: canDo(user, 'billing', 'create'),
        edit: canDo(user, 'billing', 'edit'),
        void: canDo(user, 'billing', 'void'),
        approveCn: canDo(user, 'treasury', 'approve'),
        voucher: canDo(user, 'treasury', 'create'),
        listExport: canDo(user, 'treasury', 'export'),
        docExport: canDo(user, 'billing', 'export'),
      }}
      search={search}
      today={officeToday()}
      thisMonth={thisMonth}
      record={read && read.ok ? read.page : null}
      refused={read && !read.ok ? read.reason : null}
    />
  )
}
