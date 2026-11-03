'use server'

import { getUser } from '@/lib/auth'
import { opensPage } from '@/lib/page-tabs'
import { canAccessTreasury } from '@/lib/roles'
import { waitingForFinance } from './_lib/requests-model'
import { readPaymentRequests } from './_lib/requests-read'

// The Finance sidebar's count on Payment request (2026-11-03, the user: "当有request时显示有多少个request可以吗？直到我开
// pv" → the soft count, sample B): the page's own "Waiting for you" — what still waits for Finance's voucher — read as
// the page reads it, for an account that may open the page (its gate: the page's tab and Treasury). Null otherwise,
// and null when the read fails: the sidebar then shows no number, never an error.
export async function waitingRequestCount(): Promise<number | null> {
  try {
    const user = await getUser()
    if (!user || !canAccessTreasury(user) || !opensPage(user.tabs, '/payments/requests')) return null
    const { rows } = await readPaymentRequests(user)
    return waitingForFinance(rows).length
  } catch {
    return null
  }
}
