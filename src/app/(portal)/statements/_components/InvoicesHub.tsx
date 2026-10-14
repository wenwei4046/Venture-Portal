import dayjs from 'dayjs'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { getPeriodMonth } from '@/lib/utils'
import { loadInvoiceHub } from '../_lib/invoice-hub'
import type { InvoiceCardKey } from '../_lib/invoice-model'
import InvoicesHubClient from './InvoicesHubClient'

// Invoice's hub (2026-10-14, the Finance revamp v2 — D10): `/statements` for
// every reader of it. The server reads the month once (`loadInvoiceHub`); the
// browser picks the card, searches, ticks and opens the drawer. Each button
// asks what its action asks (Billing · Create / Edit / Void / Export, Treasury
// · Approve for a credit note, Treasury · Create for a voucher, Treasury ·
// Export for the list's files) — on this page's boxes, as requirePage narrowed them.

const CARDS: ReadonlyArray<InvoiceCardKey> = ['all', 'issued', 'paid', 'draft', 'voided', 'cn', 'mkt', 'nonbill']

export default async function InvoicesHub({ searchParams }: { searchParams: Promise<{ period?: string; status?: string; new?: string }> }) {
  const user = await requirePermission('billing')
  const supabase = await createClient()
  const { period: rawPeriod, status, new: fresh } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const hub = await loadInvoiceHub(supabase, period)
  return (
    <InvoicesHubClient
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
      canSetDefault={canDo(user, 'billing', 'create')}
      today={officeToday()}
      thisMonth={officeMonth()}
      initialCard={CARDS.includes(status as InvoiceCardKey) ? (status as InvoiceCardKey) : 'all'}
      openNew={fresh === '1'}
    />
  )
}
