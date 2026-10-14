import type { HrIconName } from '@/components/hrv/icons'
import type { CardTone, HubCardItem } from '@/components/finv/Hub'
import type { HubCardKey, HubLedger } from './hub-ledger'

// Payments' and Receipt's cards (2026-10-14, the Finance revamp v2 — D02,
// D09; moved out of VoucherHub on 2026-10-15 so the phone app's stacked
// cards, M02 / M09, say the same): each card's name, tone and icon, and what
// it counts and sums — the ledger's own figures.

export const CARD: Record<HubCardKey, { label: string; tone: CardTone; icon: HrIconName; title: string }> = {
  all: { label: 'All vouchers', tone: 'all', icon: 'doc', title: 'All vouchers' },
  draft: { label: 'Draft', tone: 'draft', icon: 'doc', title: 'Draft' },
  pending_approval: { label: 'Pending approval', tone: 'pending_approval', icon: 'calendar', title: 'Pending approval' },
  approved: { label: 'Approved', tone: 'approved', icon: 'approve', title: 'Approved' },
  paid: { label: 'Paid', tone: 'paid', icon: 'payroll', title: 'Paid' },
  voided: { label: 'Voided', tone: 'quiet', icon: 'fileAlert', title: 'Voided' },
  payroll: { label: 'Payroll batches', tone: 'payroll', icon: 'payroll', title: 'Payroll batches' },
}

/** Receipt's own words for two of them. */
export const RECEIPT_CARD: Partial<Record<HubCardKey, { label: string; title: string }>> = {
  all: { label: 'All receipts', title: 'All receipts' },
  paid: { label: 'Received', title: 'Received' },
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const rm = (n: number) => `RM ${f2(n)}`

/** A card's name and title, in Receipt's words on Receipt. */
export function cardLook(key: HubCardKey, receipts: boolean): { label: string; tone: CardTone; icon: HrIconName; title: string } {
  return { ...CARD[key], ...(receipts ? RECEIPT_CARD[key] : null) }
}

/** The ledger's cards as the hub draws them: the name, "11 vouchers · 127 other", the figure (+RM on Receipt). */
export function hubCards(ledger: HubLedger): HubCardItem[] {
  const receipts = ledger.receipts
  const [one, many] = receipts ? ['receipt', 'receipts'] : ['voucher', 'vouchers']
  return ledger.cards.map((c) => ({
    key: c.key,
    tone: CARD[c.key].tone,
    icon: CARD[c.key].icon,
    label: cardLook(c.key, receipts).label,
    sub:
      c.key === 'payroll'
        ? `${plural(c.count, 'batch', 'batches')} · ${plural(ledger.batches.reduce((n, b) => n + b.count, 0), 'voucher', 'vouchers')}`
        : `${plural(c.count, one, many)}${c.other > 0 ? ` · ${c.other} other` : ''}`,
    value: receipts ? `+${rm(c.amount)}` : rm(c.amount),
  }))
}
