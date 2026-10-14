import React from 'react'
import { Document } from '@react-pdf/renderer'
import {
  DocBlock,
  DocHeadline,
  DocItems,
  DocMeta,
  DocPage,
  DocParties,
  DocTotals,
  PAYMENT_DETAILS,
  docDay,
  docMoney,
  docMonth,
  docPeriod,
  type DocLine,
  type DocRow,
} from '@/lib/export/doc-sheet'

// An invoice's document (2026-10-15, the Finance revamp v2 — README §3, P01):
// *Invoice* and the H; Invoice number · Date of issue · Date due · Period;
// HOUZS Venture beside *Bill to*; *RM 63,440.00 due 15 October 2026* over its
// description; Description · Qty · Unit price · Amount (each line one unit at
// its amount, the invoice's month under it); Subtotal · Total · Amount due;
// the payment details; the footer. One A4 page an invoice — a batch prints
// each on its own, its own *Page 1 of 1*. A consolidated payroll invoice keeps
// its lines grouped by department with a subtotal each.

export interface InvoiceLineData {
  description: string | null
  amount: number
  /** Its P&L segment (a consolidated payroll invoice): the lines group by department. */
  segment?: string | null
}

export interface InvoiceDocData {
  id: string
  invoice_no: string | null
  /** draft · issued · paid · paid_via_netting · voided */
  status: string
  period_month: string
  invoice_date: string | null
  due_date: string | null
  reference_no: string | null
  description: string | null
  /** "Venture (HV) OPEX". */
  billing_mode_label: string
  bill_to: {
    name: string
    /** "Subsidiary · HK" / "Department pool" / "External party". */
    kind: string
    /** A free-text party's address, phone and email. */
    contact: string[]
  }
  /** Its stored lines; none — a simple invoice, the invoice itself one line. */
  lines: InvoiceLineData[]
  total: number
  /** Approved credit notes against it. */
  credited: number
  /** Money received against it. */
  received: number
  /** What it still asks for (a draft: its total). */
  remaining: number
  /** The day its last money came in (a paid one's headline). */
  paid_on: string | null
}

// gl_segment → a department's group on a consolidated payroll invoice.
const SEGMENT_LABEL: Record<string, string> = {
  hr: 'HR',
  finance: 'Finance',
  director_office: 'Director Office',
  director: 'Director',
  marketing: 'Marketing',
  it: 'IT',
}

const r2 = (n: number) => Math.round(n * 100) / 100
const firstLine = (s: string | null | undefined) => (s ?? '').split(/\r?\n/)[0].trim()

/** The headline: what it asks for and by when — or that it is paid, voided. */
export function invoiceHeadline(inv: Pick<InvoiceDocData, 'status' | 'total' | 'remaining' | 'due_date' | 'paid_on'>): string {
  if (inv.status === 'voided') return `${docMoney(inv.total)} voided`
  if (inv.status === 'paid' || inv.status === 'paid_via_netting') {
    const on = docDay(inv.paid_on)
    return on ? `${docMoney(inv.total)} paid on ${on}` : `${docMoney(inv.total)} paid`
  }
  const amount = inv.status === 'issued' ? inv.remaining : inv.total
  const due = docDay(inv.due_date)
  return due ? `${docMoney(amount)} due ${due}` : `${docMoney(amount)} due`
}

function InvoicePage({ inv }: { inv: InvoiceDocData }) {
  const no = inv.invoice_no ?? 'Draft'
  const headline = invoiceHeadline(inv)
  const period = docPeriod(inv.period_month)
  const meta: DocLine[] = [
    { label: 'Invoice number', value: no, strong: true },
    { label: 'Date of issue', value: docDay(inv.invoice_date) ?? '—' },
    { label: 'Date due', value: docDay(inv.due_date) ?? '—' },
    { label: 'Period', value: docMonth(inv.period_month) ?? '—' },
  ]
  if (inv.reference_no) meta.push({ label: 'Reference', value: inv.reference_no })
  // A draft or a voided invoice says so: the design's sheet is an issued one.
  if (inv.status === 'draft') meta.push({ label: 'Status', value: 'Draft — not issued' })
  if (inv.status === 'voided') meta.push({ label: 'Status', value: 'Voided' })

  const lines = inv.lines.length > 0 ? inv.lines : [{ description: firstLine(inv.description) || 'Invoice amount', amount: inv.total, segment: null }]
  const row = (l: InvoiceLineData): DocRow => ({
    cells: [l.description?.trim() || '—', '1', docMoney(l.amount), docMoney(l.amount)],
    second: period,
  })
  const segmented = lines.some((l) => l.segment)
  const groups = segmented
    ? [...new Set(lines.map((l) => l.segment ?? ''))].map((seg) => {
        const its = lines.filter((l) => (l.segment ?? '') === seg)
        const label = SEGMENT_LABEL[seg] ?? (seg || 'Other')
        return { label, rows: its.map(row), subtotal: { cells: [`${label} subtotal`, '', '', docMoney(r2(its.reduce((s, l) => s + l.amount, 0)))] } }
      })
    : undefined
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0))

  const totals = [
    { label: 'Subtotal', value: docMoney(subtotal) },
    { label: 'Total', value: docMoney(inv.total) },
  ]
  if (inv.credited > 0.004) totals.push({ label: 'Credit notes', value: docMoney(-inv.credited) })
  if (inv.received > 0.004 && inv.status !== 'paid' && inv.status !== 'paid_via_netting') totals.push({ label: 'Paid', value: docMoney(-inv.received) })
  totals.push({ label: 'Amount due', value: docMoney(inv.status === 'issued' || inv.status === 'draft' ? inv.remaining : 0) })

  return (
    <DocPage title="Invoice" footer={`${no} · ${headline}`}>
      <DocMeta lines={meta} />
      <DocParties counter={{ heading: 'Bill to', lines: [inv.bill_to.name, inv.bill_to.kind, inv.billing_mode_label, ...inv.bill_to.contact] }} />
      <DocHeadline headline={headline} summary={inv.description?.trim() || null} />
      <DocItems
        columns={[{ label: 'Description' }, { label: 'Qty', width: 40, align: 'right' }, { label: 'Unit price', width: 100, align: 'right' }, { label: 'Amount', width: 100, align: 'right' }]}
        rows={groups ? undefined : lines.map(row)}
        groups={groups}
      />
      <DocTotals lines={totals} />
      <DocBlock title="Payment details" lines={PAYMENT_DETAILS} note="Kindly quote the invoice number as your payment reference." />
    </DocPage>
  )
}

export function InvoiceDocPdf({ invoices }: { invoices: InvoiceDocData[] }): React.ReactElement {
  return (
    <Document>
      {invoices.map((inv) => (
        <InvoicePage key={inv.id} inv={inv} />
      ))}
    </Document>
  )
}
