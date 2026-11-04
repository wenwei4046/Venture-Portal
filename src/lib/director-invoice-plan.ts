// Payroll ▾ › Generate director payroll invoices (2026-11-04 — the user: "做进去payroll 按， 但分开按generate
// director payroll invoice 可以吗？"). What the month's director invoices will be: a draft a company, HR's director
// CTC itemised as HR keyed it (lib/director-ctc-lines — the Director OPEX invoices of August and September), every
// line on the one account picked, a company not ticked or already billed this month left out. Pure; the action and
// its preview both read it, so the window shows what is written.
import dayjs from 'dayjs'
import { directorCtcParts, type DirectorCtcComponents } from './director-ctc-lines'

export interface DirectorInvoiceSource extends DirectorCtcComponents {
  companyId: string
  shortCode: string
  name: string
  totalCtc: number
}

export interface DirectorInvoiceDraft {
  companyId: string
  shortCode: string
  name: string
  total: number
  lines: Array<{ description: string; amount: number; categoryCode: string }>
}

export interface DirectorInvoicePlan {
  description: string
  invoices: DirectorInvoiceDraft[]
  /** Ticked but not drafted: a company billed for its directors this month already (an issued or paid invoice). */
  skipped: Array<{ companyId: string; name: string; reason: 'billed' }>
  total: number
}

const cents = (n: number) => Math.round(n * 100)

/** The header every director invoice carries ("Director salary CTC — October 2026") — Create invoice's own words. */
export const directorInvoiceDescription = (month: string) => `Director salary CTC — ${dayjs(`${month}-01`).format('MMMM YYYY')}`

export function directorInvoicePlan(input: {
  rows: readonly DirectorInvoiceSource[]
  /** `YYYY-MM`. */
  month: string
  /** The companies ticked; null — every company with a CTC. */
  picked: ReadonlySet<string> | null
  /** Companies with an issued or paid director invoice this month. */
  billed: ReadonlySet<string>
  account: string
}): DirectorInvoicePlan {
  const { rows, month, picked, billed, account } = input
  const invoices: DirectorInvoiceDraft[] = []
  const skipped: DirectorInvoicePlan['skipped'] = []
  for (const r of rows) {
    if (cents(r.totalCtc) <= 0) continue
    if (picked && !picked.has(r.companyId)) continue
    if (billed.has(r.companyId)) {
      skipped.push({ companyId: r.companyId, name: r.name, reason: 'billed' })
      continue
    }
    const lines = directorCtcParts(r, month).map((p) => ({ description: p.description, amount: p.amount, categoryCode: account }))
    invoices.push({ companyId: r.companyId, shortCode: r.shortCode, name: r.name, total: Math.round(lines.reduce((s, l) => s + cents(l.amount), 0)) / 100, lines })
  }
  return {
    description: directorInvoiceDescription(month),
    invoices,
    skipped,
    total: Math.round(invoices.reduce((s, i) => s + cents(i.total), 0)) / 100,
  }
}
