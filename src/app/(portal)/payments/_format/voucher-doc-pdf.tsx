import React from 'react'
import { Document } from '@react-pdf/renderer'
import {
  DocBlock,
  DocHeadline,
  DocItems,
  DocItemsHead,
  DocItemRow,
  DocMeta,
  DocPage,
  DocParties,
  DocSignatures,
  DocTotals,
  docDay,
  docMoney,
  docMonth,
  docStamp,
  type DocColumn,
  type DocLine,
} from '@/lib/export/doc-sheet'
import { recipientAccountLabel, salaryPaymentLabel } from '@/lib/payroll-voucher-display'

// A voucher's document (2026-10-15, the Finance revamp v2 — README §3, P02 and
// P03; credit = a receipt). A payment voucher: *Payment voucher* and the H;
// Voucher number · Payment date · Pay from · Status; HOUZS Venture beside *Pay
// to*; *RM 25,000.00 to pay on 6 October 2026* (*paid on* once paid) over its
// description; Deducted from · Account · Amount; Total; the Approval list
// (Created · Submitted · Approved · Paid — *Not yet* until it is); Prepared by ·
// Approved by · Received by. A receipt: *Receipt*; Receipt number · Date paid ·
// Payment method · Reference; *Received from*; *RM 150,000.00 paid on 7
// October 2026*; Description · Credited to · Amount; Total · Amount paid;
// Received by · Company stamp. A salary or statutory voucher keeps its detail
// pages after it (whom it pays, into which account; whose contribution), drawn
// to the same rules.

export interface VoucherSourceData {
  pool_label: string
  /** "6100 · Advertising". */
  account_label: string | null
  amount: number
}

export interface StatutoryCoverageData {
  id: string
  scope: string
  payroll_row_id: string
  employee_name: string
  employee_code: string | null
  department_name: string
  period_month: string
  scheme: string
  amount: number
}

export interface SalaryPaymentData {
  id: string
  scope: string
  payroll_row_id: string
  employee_name: string
  employee_code: string | null
  department_name: string | null
  period_month: string
  net: number
  salary_component: string | null
  recipient_account: string | null
  bank_name: string | null
  bank_account_no: string | null
}

/** A step of its approval: who, when — none yet. */
export interface VoucherStep {
  by: string | null
  at: string | null
}

export interface VoucherDocData {
  id: string
  voucher_no: string | null
  voucher_type: string
  direction: string
  /** draft · pending_approval · approved · paid · voided */
  status: string
  amount: number
  payment_date: string | null
  created_at: string
  payee_name: string
  /** "Group company" — a payee the system knows as a company. */
  payee_kind: string | null
  /** "Bank transfer" / "Netting". */
  method: string | null
  /** The bank it moves through. */
  bank: { name: string; number: string | null } | null
  description: string | null
  notes: string | null
  payment_reference: string | null
  sources: VoucherSourceData[]
  /** The pool a receipt with no source lines is credited to. */
  target_pool_label?: string | null
  /** Its approval, step by step (a payment voucher's). */
  approval?: { created: VoucherStep; submitted: VoucherStep | null; approved: VoucherStep | null; paid: VoucherStep | null }
  /** Immutable contribution snapshots for this statutory PV; absent for legacy vouchers. */
  statutory_coverage?: StatutoryCoverageData[]
  /** Recorded salary components and receiving accounts; legacy bank snapshots may be absent. */
  salary_payments?: SalaryPaymentData[]
}

const STATUS_WORD: Record<string, string> = { draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved', paid: 'Paid', voided: 'Voided' }
const r2 = (n: number) => Math.round(n * 100) / 100
const firstLine = (s: string | null | undefined) => (s ?? '').split(/\r?\n/)[0].trim()
const step = (s: VoucherStep | null | undefined, open = 'Not yet'): Pick<DocLine, 'value' | 'faint'> =>
  s && (s.by || s.at) ? { value: [s.by, docStamp(s.at)].filter(Boolean).join(' · ') } : { value: open, faint: true }

/** The headline: what it pays (or paid, or received) and when. */
export function voucherHeadline(v: Pick<VoucherDocData, 'direction' | 'status' | 'amount' | 'payment_date'>): string {
  const amount = docMoney(v.amount)
  const day = docDay(v.payment_date)
  if (v.status === 'voided') return `${amount} voided`
  if (v.direction === 'credit' || v.status === 'paid') return day ? `${amount} paid on ${day}` : `${amount} paid`
  return day ? `${amount} to pay on ${day}` : `${amount} to pay`
}

function ReceiptPage({ v }: { v: VoucherDocData }) {
  const no = v.voucher_no ?? v.id.slice(0, 8)
  const headline = voucherHeadline(v)
  const meta: DocLine[] = [
    { label: 'Receipt number', value: no, strong: true },
    { label: 'Date paid', value: docDay(v.payment_date) ?? '—' },
    // "Bank transfer · Alliance Bank 1200-4410-0091" (the design's receipt joins the bank and its number with a space).
    { label: 'Payment method', value: [v.method, v.bank ? [v.bank.name, v.bank.number].filter(Boolean).join(' ') : null].filter(Boolean).join(' · ') || '—' },
  ]
  if (v.payment_reference) meta.push({ label: 'Reference', value: v.payment_reference })
  if (v.status === 'voided') meta.push({ label: 'Status', value: 'Voided' })
  const what = firstLine(v.description) || 'Received'
  const rows =
    v.sources.length > 0
      ? v.sources.map((s) => ({ cells: [what, s.pool_label, docMoney(s.amount)], second: s.account_label }))
      : [{ cells: [what, v.target_pool_label ?? '—', docMoney(v.amount)], second: null }]
  return (
    <DocPage title="Receipt" footer={`${no} · ${headline}`}>
      <DocMeta lines={meta} />
      <DocParties counter={{ heading: 'Received from', lines: [v.payee_name, v.payee_kind ?? ''] }} />
      <DocHeadline headline={headline} summary={v.description?.trim() || null} />
      <DocItems columns={[{ label: 'Description' }, { label: 'Credited to', width: 170 }, { label: 'Amount', width: 110, align: 'right' }]} rows={rows} />
      <DocTotals
        lines={[
          { label: 'Total', value: docMoney(v.amount) },
          { label: 'Amount paid', value: docMoney(v.status === 'voided' ? 0 : v.amount) },
        ]}
      />
      <DocSignatures captions={[v.approval?.created.by ? `Received by · ${v.approval.created.by}` : 'Received by', 'Company stamp']} />
    </DocPage>
  )
}

function PaymentVoucherPage({ v }: { v: VoucherDocData }) {
  const no = v.voucher_no ?? v.id.slice(0, 8)
  const headline = voucherHeadline(v)
  const meta: DocLine[] = [
    { label: 'Voucher number', value: no, strong: true },
    { label: 'Payment date', value: docDay(v.payment_date) ?? '—' },
    { label: 'Pay from', value: v.bank ? [v.bank.name, v.bank.number].filter(Boolean).join(' · ') : '—' },
    { label: 'Status', value: STATUS_WORD[v.status] ?? v.status },
  ]
  if (v.payment_reference) meta.push({ label: 'Reference', value: v.payment_reference })
  const rows =
    v.sources.length > 0
      ? v.sources.map((s) => ({ cells: [s.pool_label, s.account_label ?? '—', docMoney(s.amount)] }))
      : [{ cells: ['—', '—', docMoney(v.amount)] }]
  const a = v.approval
  const approval: DocLine[] = [
    { label: 'Created', ...step(a?.created) },
    { label: 'Submitted', ...step(a?.submitted) },
    { label: 'Approved', ...step(a?.approved) },
    { label: 'Paid', ...step(a?.paid) },
  ]
  const summary = [v.description?.trim(), v.notes?.trim() ? `Notes: ${v.notes.trim()}` : null].filter(Boolean).join('\n') || null
  return (
    <DocPage title="Payment voucher" footer={`${no} · ${docMoney(v.amount)} to ${v.payee_name}`}>
      <DocMeta lines={meta} />
      <DocParties counter={{ heading: 'Pay to', lines: [v.payee_name, [v.payee_kind, v.method].filter(Boolean).join(' · ')] }} />
      <DocHeadline headline={headline} summary={summary} />
      <DocItems columns={[{ label: 'Deducted from' }, { label: 'Account', width: 170 }, { label: 'Amount', width: 110, align: 'right' }]} rows={rows} />
      <DocTotals lines={[{ label: 'Total', value: docMoney(v.amount) }]} />
      <DocBlock title="Approval" lines={approval} first />
      <DocSignatures
        captions={[
          a?.created.by ? `Prepared by · ${a.created.by}` : 'Prepared by',
          a?.approved?.by ? `Approved by · ${a.approved.by}` : 'Approved by',
          'Received by',
        ]}
      />
    </DocPage>
  )
}

/** A detail appendix: its title, the voucher it belongs to, the column heads on every page, the rows, its total. */
function DetailPages({
  v,
  title,
  meta,
  columns,
  rows,
  total,
}: {
  v: VoucherDocData
  title: string
  meta: DocLine[]
  columns: DocColumn[]
  rows: Array<{ cells: string[]; second?: string | null }>
  total: { label: string; value: string }
}) {
  const no = v.voucher_no ?? v.id.slice(0, 8)
  return (
    <DocPage
      title={title}
      footer={`${no} · ${title}`}
      head={
        <>
          <DocMeta lines={meta} />
          <DocItemsHead columns={columns} />
        </>
      }
    >
      {rows.map((r, i) => (
        <DocItemRow key={i} columns={columns} row={r} />
      ))}
      <DocTotals lines={[total]} />
    </DocPage>
  )
}

function StatutoryCoveragePages({ v }: { v: VoucherDocData }) {
  const lines = v.statutory_coverage ?? []
  const people = new Set(lines.map((line) => `${line.scope}:${line.payroll_row_id}`)).size
  const periods = [...new Set(lines.map((line) => docMonth(line.period_month) ?? line.period_month))].join(' / ')
  return (
    <DetailPages
      v={v}
      title="Statutory contribution details"
      meta={[
        { label: 'Voucher number', value: v.voucher_no ?? v.id.slice(0, 8), strong: true },
        { label: 'Paid to', value: v.payee_name },
        { label: 'Period', value: periods || '—' },
        { label: 'People', value: `${people} ${people === 1 ? 'person' : 'people'} · recorded when this PV was generated` },
      ]}
      columns={[{ label: 'Employee' }, { label: 'Department', width: 170 }, { label: 'Scheme', width: 60 }, { label: 'Contribution', width: 100, align: 'right' }]}
      rows={lines.map((line) => ({ cells: [line.employee_name, line.department_name, line.scheme, docMoney(line.amount)], second: line.employee_code }))}
      total={{ label: 'Total contribution', value: docMoney(r2(lines.reduce((sum, line) => sum + line.amount, 0))) }}
    />
  )
}

function SalaryPaymentPages({ v }: { v: VoucherDocData }) {
  const lines = v.salary_payments ?? []
  const people = new Set(lines.map((line) => `${line.scope}:${line.payroll_row_id}`)).size
  const periods = [...new Set(lines.map((line) => docMonth(line.period_month) ?? line.period_month))].join(' / ')
  // The bank and the number, which of the person's accounts under it.
  const account = (line: SalaryPaymentData) => {
    const which = recipientAccountLabel(line.recipient_account)
    const where = line.bank_name && line.bank_account_no ? `${line.bank_name} ${line.bank_account_no}` : 'Bank details not recorded'
    return which ? `${where}\n${which}` : where
  }
  return (
    <DetailPages
      v={v}
      title="Salary payment details"
      meta={[
        { label: 'Voucher number', value: v.voucher_no ?? v.id.slice(0, 8), strong: true },
        { label: 'Period', value: periods || '—' },
        { label: 'People', value: `${people} ${people === 1 ? 'person' : 'people'} · receiving accounts recorded when this PV was generated` },
      ]}
      columns={[{ label: 'Employee' }, { label: 'Payment', width: 110 }, { label: 'Receiving account', width: 170 }, { label: 'Amount', width: 90, align: 'right' }]}
      rows={lines.map((line) => ({
        cells: [line.employee_name, salaryPaymentLabel(line.salary_component), account(line), docMoney(line.net)],
        second: [line.employee_code, line.department_name ?? '-'].filter(Boolean).join(' · '),
      }))}
      total={{ label: 'Total salary payment', value: docMoney(r2(lines.reduce((sum, line) => sum + line.net, 0))) }}
    />
  )
}

export function VoucherDocPdf({ vouchers }: { vouchers: VoucherDocData[] }): React.ReactElement {
  return (
    <Document>
      {vouchers.map((v) => (
        <React.Fragment key={v.id}>
          {v.direction === 'credit' ? <ReceiptPage v={v} /> : <PaymentVoucherPage v={v} />}
          {v.statutory_coverage?.length ? <StatutoryCoveragePages v={v} /> : null}
          {v.salary_payments?.length ? <SalaryPaymentPages v={v} /> : null}
        </React.Fragment>
      ))}
    </Document>
  )
}
