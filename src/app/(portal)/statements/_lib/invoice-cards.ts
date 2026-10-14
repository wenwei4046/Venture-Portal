import type { HrIconName } from '@/components/hrv/icons'
import type { CardTone, HubCardItem } from '@/components/finv/Hub'
import { STATUS_CARD_KEYS, statusCard, type InvoiceCardKey, type InvoiceHubData, type StatusCardKey } from './invoice-model'

// Invoice's cards (2026-10-14, the Finance revamp v2 — D10 / M10; moved here
// 2026-10-15 so the Finance phone app's stacked cards are the desktop's): All
// invoices, Issued, Paid, Draft, Voided — each the month's invoices in that
// state, counted and summed — then Credit notes, Marketing projects and
// Non-billable, each its own list.

const f2 = (n: number) => (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rm = (n: number) => `RM ${f2(n)}`
const r2 = (n: number) => Math.round(n * 100) / 100
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export const INVOICE_CARD: Record<InvoiceCardKey, { label: string; tone: CardTone; icon: HrIconName }> = {
  all: { label: 'All invoices', tone: 'all', icon: 'doc' },
  issued: { label: 'Issued', tone: 'issued', icon: 'invoice' },
  paid: { label: 'Paid', tone: 'paid', icon: 'payroll' },
  draft: { label: 'Draft', tone: 'draft', icon: 'doc' },
  voided: { label: 'Voided', tone: 'quiet', icon: 'fileAlert' },
  cn: { label: 'Credit notes', tone: 'peach', icon: 'receipt' },
  mkt: { label: 'Marketing projects', tone: 'peach', icon: 'people' },
  nonbill: { label: 'Non-billable', tone: 'quiet', icon: 'doc' },
}
export const INVOICE_CARD_KEYS = Object.keys(INVOICE_CARD) as InvoiceCardKey[]
export const isStatusCard = (k: string): k is StatusCardKey => (STATUS_CARD_KEYS as readonly string[]).includes(k)

/** The cards, figures and all, in the design's order. */
export function invoiceCards(hub: Pick<InvoiceHubData, 'invoices' | 'creditNotes' | 'contracts' | 'nonBillable'>): HubCardItem[] {
  const activeContracts = hub.contracts.filter((c) => c.status === 'active').length
  const cnTotal = r2(hub.creditNotes.filter((c) => c.status !== 'voided').reduce((s, c) => s + c.amount, 0))
  const deducted = r2(hub.nonBillable.filter((t) => t.out).reduce((s, t) => s + t.amount, 0))
  return INVOICE_CARD_KEYS.map((k) => {
    const look = INVOICE_CARD[k]
    let sub: string
    let value: string
    if (isStatusCard(k)) {
      const f = statusCard(hub.invoices, k)
      sub = plural(f.count, 'invoice', 'invoices')
      value = rm(f.amount)
    } else if (k === 'cn') {
      sub = plural(hub.creditNotes.length, 'credit note', 'credit notes')
      value = cnTotal > 0 ? `−${rm(cnTotal)}` : rm(0)
    } else if (k === 'mkt') {
      sub = hub.contracts.length === 0 ? '0 projects' : `${plural(hub.contracts.length, 'project', 'projects')} · ${activeContracts} active`
      value = rm(r2(hub.contracts.reduce((s, c) => s + (c.amount ?? 0), 0)))
    } else {
      sub = plural(hub.nonBillable.length, 'transaction', 'transactions')
      value = rm(deducted)
    }
    return { key: k, tone: look.tone, icon: look.icon, label: look.label, sub, value }
  })
}
