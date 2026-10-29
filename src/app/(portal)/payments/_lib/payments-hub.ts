import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { startRead } from '@/lib/start-read'
import { officeMonth, officeToday } from '@/lib/office-time'
import type { User } from '@/types'
import { loadHubLedger, type HubLedger, type LedgerParams } from './hub-ledger'
import { loadCreatePaymentOptions, type CreatePaymentOptions } from './create-payment-options'

// Payments' hub, read (2026-10-14, the Finance revamp v2 — D02–D05; moved out
// of PaymentsHub on 2026-10-15 so the Finance phone app reads the same): the
// ledger read once, and Create payment's lists when the address opens it. The
// caller has asked the treasury. What waits for a voucher is Payments › Payment
// request's (since PR ⑥ of docs/module-spec-payment-requests.md the phone's
// Payment counts it from there too — the Dept, Payroll and Claims lists are gone).

export interface PaymentsHubData {
  ledger: HubLedger
  canCreate: boolean
  /** Create payment's dialog (whoever may make a voucher): its line, today, and — arriving with ?new=1 — open with its lists. */
  create: { prefix: string; today: string; open: boolean; initial: CreatePaymentOptions | null } | null
  canSetDefault: boolean
}

export async function loadPaymentsHub(user: User, params: LedgerParams): Promise<PaymentsHubData> {
  const supabase = await createClient()
  const canCreate = canDo(user, 'treasury', 'create')
  const canSetDefault = user.role === 'finance' || user.role === 'principal'

  const ledgerRead = startRead(loadHubLedger(supabase, user, 'debit', params))
  // Arriving with Create payment open (the Overview's button): its lists come with the page, so nothing asks for them after the navigation.
  const createRead = canCreate && params.new === '1' ? startRead(loadCreatePaymentOptions(supabase).catch(() => null)) : null

  return {
    ledger: await ledgerRead,
    canCreate,
    create: canCreate ? { prefix: `HV-PV-${officeMonth().replace('-', '')}`, today: officeToday(), open: params.new === '1', initial: createRead ? await createRead : null } : null,
    canSetDefault,
  }
}
