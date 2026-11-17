// Lead View › Leads › Showroom visits (2026-11-17, mig 20261117200000): the showroom's own log — the Google Sheet the
// outlets kept (Date, Name, Phone, Sales Person, Brand, Source, Product Inquiry, Remarks, Price Offered, Status, then
// Purchase Date, Order No., Item Purchase, Sales, Repeat Purchase, Purchase Reason, Remarks). Pure parts, tested in
// visits.test.ts.

export type VisitSource = 'facebook' | 'xhs' | 'google' | 'referral' | 'organic' | 'whatsapp'
export type VisitStatus = 'follow_up' | 'close_sales' | 'not_buying'

/** The sheet's sources, in the Overview's order. */
export const VISIT_SOURCES: ReadonlyArray<[VisitSource, string]> = [
  ['facebook', 'Facebook'], ['xhs', 'XHS'], ['google', 'Google'], ['referral', 'Referral'], ['organic', 'Organic'], ['whatsapp', 'WhatsApp'],
]
export const VISIT_STATUSES: ReadonlyArray<[VisitStatus, string]> = [['follow_up', 'Follow up'], ['close_sales', 'Close sales'], ['not_buying', 'Not buying']]

export const sourceLabel = (s: string) => VISIT_SOURCES.find(([k]) => k === s)?.[1] ?? s
export const statusLabel = (s: string) => VISIT_STATUSES.find(([k]) => k === s)?.[1] ?? s

export interface LeadVisit {
  id: string
  outletId: string
  visitOn: string
  name: string
  phone: string
  salesPerson: string
  brand: string
  source: VisitSource
  products: string
  remarks: string
  priceOffered: number | null
  status: VisitStatus
  purchaseOn: string | null
  orderNo: string
  items: string
  sales: number | null
  repeat: boolean
  purchaseReason: string
  purchaseRemarks: string
  contactId: string | null
  createdBy: string
  updatedBy: string
  updatedAt: string
}

/** What the form edits and lead_save_visit takes (amounts as typed). */
export interface VisitDraft {
  outletId: string
  visitOn: string
  name: string
  phone: string
  salesPerson: string
  brand: string
  source: VisitSource
  products: string
  remarks: string
  priceOffered: string
  status: VisitStatus
  purchaseOn: string
  orderNo: string
  items: string
  sales: string
  repeat: boolean
  purchaseReason: string
  purchaseRemarks: string
}

export function blankVisit(outletId: string, today: string): VisitDraft {
  return {
    outletId, visitOn: today, name: '', phone: '', salesPerson: '', brand: '', source: 'facebook', products: '', remarks: '',
    priceOffered: '', status: 'follow_up', purchaseOn: '', orderNo: '', items: '', sales: '', repeat: false, purchaseReason: '', purchaseRemarks: '',
  }
}

export function draftOf(v: LeadVisit): VisitDraft {
  return {
    outletId: v.outletId, visitOn: v.visitOn, name: v.name, phone: v.phone, salesPerson: v.salesPerson, brand: v.brand, source: v.source,
    products: v.products, remarks: v.remarks, priceOffered: v.priceOffered == null ? '' : String(v.priceOffered), status: v.status,
    purchaseOn: v.purchaseOn ?? '', orderNo: v.orderNo, items: v.items, sales: v.sales == null ? '' : String(v.sales), repeat: v.repeat,
    purchaseReason: v.purchaseReason, purchaseRemarks: v.purchaseRemarks,
  }
}

/** "RM2,490.00" / "2490" / "2,490" → "2490"; '' stays ''; anything else is null (not an amount). */
export function amountOf(typed: string): string | null {
  const t = typed.replace(/rm/i, '').replace(/[,\s]/g, '')
  if (t === '') return ''
  return /^\d+(\.\d{1,2})?$/.test(t) ? t : null
}

/** What stops the form saving, in the database's words (it checks again). */
export function visitProblem(d: VisitDraft): string | null {
  if (!d.outletId) return 'Which outlet?'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.visitOn)) return 'The day they came, please.'
  if (!d.name.trim() && !d.phone.replace(/\D/g, '')) return 'A name or a phone, please.'
  if (amountOf(d.priceOffered) === null) return 'Price offered: an amount in ringgit, please.'
  if (d.status === 'close_sales') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.purchaseOn)) return 'A closed sale needs its purchase day.'
    const s = amountOf(d.sales)
    if (!s || Number(s) <= 0) return 'A closed sale needs its amount.'
  }
  return null
}

/** The draft as lead_save_visit takes it. */
export function visitPayload(d: VisitDraft): Record<string, unknown> {
  const closed = d.status === 'close_sales'
  return {
    ...d,
    priceOffered: amountOf(d.priceOffered) ?? '',
    purchaseOn: closed ? d.purchaseOn : '',
    sales: closed ? amountOf(d.sales) ?? '' : '',
  }
}

/** "0122800377" → "012-280 0377" (as the rest of Lead View shows a phone); anything else as kept. */
export function phoneText(p: string): string {
  const m = /^(01[0-9])(\d{3,4})(\d{4})$/.exec(p)
  return m ? `${m[1]}-${m[2]} ${m[3]}` : p
}

/** The values a column already has at an outlet, most used first — the form's suggestions (salesperson, brand). */
export function suggestions(visits: LeadVisit[], key: 'salesPerson' | 'brand', outletId: string): string[] {
  const n = new Map<string, number>()
  for (const v of visits) if (v.outletId === outletId && v[key].trim()) n.set(v[key].trim(), (n.get(v[key].trim()) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k)
}

/** The sheet as CSV, its own column names. */
export function visitsCsv(visits: LeadVisit[], outletName: (id: string) => string): string {
  const head = ['Date', 'Outlet', 'Name', 'Phone No.', 'Sales Person', 'Brand', 'Source', 'Product Inquiry', 'Remarks', 'Price Offered', 'Status',
    'Purchase Date', 'Order No.', 'Item Purchase', 'Sales', 'Repeat Purchase', 'Purchase Reason', 'Purchase Remarks']
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const rows = visits.map(v => [v.visitOn, outletName(v.outletId), v.name, v.phone, v.salesPerson, v.brand, sourceLabel(v.source), v.products, v.remarks,
    v.priceOffered ?? '', statusLabel(v.status), v.purchaseOn ?? '', v.orderNo, v.items, v.sales ?? '', v.repeat ? 'Yes' : '', v.purchaseReason, v.purchaseRemarks])
  return [head, ...rows].map(r => r.map(cell).join(',')).join('\n')
}
