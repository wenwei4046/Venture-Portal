import React from 'react'
import { Document } from '@react-pdf/renderer'
import { DocHeadline, DocItems, DocMeta, DocPage, DocParties, DocTotals, docMoney, docMonth, docOfficeDay, type DocLine } from '@/lib/export/doc-sheet'

// A credit note's document (2026-10-15, the Finance revamp v2 — README §3,
// P04): *Credit note* and the H; Credit note number · Date of issue ·
// Original invoice · Period; HOUZS Venture beside *Credit to*; *RM 220.40
// credited on 10 October 2026* over its reason; the credit as one line (what
// it credits, its account under it); Original invoice · This credit · Revised
// amount — the invoice less every approved credit against it, this one
// included; the footer. A draft says it waits for approval, a voided one that
// it no longer counts.

export interface CreditNoteDocData {
  id: string
  credit_note_no: string | null
  /** draft · approved · voided */
  status: string
  amount: number
  reason: string
  /** When it was issued: approved, or made (a draft). */
  issued_at: string | null
  /** Its category's name ("Salary Income") — a customer's document shows no GL code. */
  category_label: string | null
  credit_to: { name: string; kind: string }
  invoice_no: string | null
  invoice_period: string | null
  /** What the invoice it credits is for (its description's first line). */
  invoice_summary: string | null
  invoice_total: number
  /** The invoice's OTHER approved credit notes. */
  other_credits: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** The headline: credited on its day — or that it waits, or no longer counts. */
export function creditNoteHeadline(cn: Pick<CreditNoteDocData, 'status' | 'amount' | 'issued_at'>): string {
  if (cn.status === 'draft') return `${docMoney(cn.amount)} to credit once approved`
  if (cn.status === 'voided') return `${docMoney(cn.amount)} credit voided`
  const on = docOfficeDay(cn.issued_at)
  return on ? `${docMoney(cn.amount)} credited on ${on}` : `${docMoney(cn.amount)} credited`
}

function CreditNotePage({ cn }: { cn: CreditNoteDocData }) {
  const no = cn.credit_note_no ?? 'Draft'
  const headline = creditNoteHeadline(cn)
  const meta: DocLine[] = [
    { label: 'Credit note number', value: no, strong: true },
    { label: 'Date of issue', value: docOfficeDay(cn.issued_at) ?? '—' },
    { label: 'Original invoice', value: cn.invoice_no ?? '—' },
    { label: 'Period', value: docMonth(cn.invoice_period) ?? '—' },
  ]
  if (cn.status === 'draft') meta.push({ label: 'Status', value: 'Draft — awaiting approval' })
  if (cn.status === 'voided') meta.push({ label: 'Status', value: 'Voided' })

  // Only an approved credit changes the invoice.
  const counts = cn.status === 'approved' ? cn.amount : 0
  const totals = [{ label: 'Original invoice', value: docMoney(cn.invoice_total) }]
  if (cn.other_credits > 0.004) totals.push({ label: 'Other credit notes', value: docMoney(-cn.other_credits) })
  totals.push({ label: 'This credit', value: docMoney(-cn.amount) })
  totals.push({ label: 'Revised amount', value: docMoney(r2(cn.invoice_total - cn.other_credits - counts)) })

  return (
    <DocPage
      title="Credit note"
      footer={cn.invoice_no ? `${no} · ${docMoney(cn.amount)} ${cn.status === 'approved' ? 'credited' : 'to credit'} against ${cn.invoice_no}` : `${no} · ${headline}`}
    >
      <DocMeta lines={meta} />
      <DocParties counter={{ heading: 'Credit to', lines: [cn.credit_to.name, cn.credit_to.kind] }} />
      <DocHeadline headline={headline} summary={cn.reason || null} />
      <DocItems
        columns={[{ label: 'Description' }, { label: 'Qty', width: 40, align: 'right' }, { label: 'Unit price', width: 100, align: 'right' }, { label: 'Amount', width: 100, align: 'right' }]}
        rows={[
          {
            cells: [cn.invoice_summary || (cn.invoice_no ? `Invoice ${cn.invoice_no}` : 'Credit'), '1', docMoney(-cn.amount), docMoney(-cn.amount)],
            second: cn.category_label,
          },
        ]}
      />
      <DocTotals lines={totals} />
    </DocPage>
  )
}

export function CreditNoteDocPdf({ creditNotes }: { creditNotes: CreditNoteDocData[] }): React.ReactElement {
  return (
    <Document>
      {creditNotes.map((cn) => (
        <CreditNotePage key={cn.id} cn={cn} />
      ))}
    </Document>
  )
}
