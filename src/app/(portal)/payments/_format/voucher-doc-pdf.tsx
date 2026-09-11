import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import { recipientAccountLabel, salaryPaymentLabel } from '@/lib/payroll-voucher-display'

// Per-voucher document PDF. Each voucher starts on an A4 portrait page. Mirrors the
// invoice document layout (HV letterhead + meta + party + per-source table).
// Used for single download (?id=) and batch (?ids=) printing of payment
// vouchers (debit) / official receipts (credit).

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 48, color: '#1a1a1a' },
  letterhead: { borderBottom: '1pt solid #1a1a1a', paddingBottom: 12, marginBottom: 24 },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 16 },
  brandSub: { fontFamily: 'Helvetica-Oblique', fontSize: 9, color: '#555', marginTop: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 20, letterSpacing: 1 },
  metaBlock: { textAlign: 'right' },
  metaLine: { fontSize: 9, marginBottom: 2 },
  metaLabel: { color: '#777', fontFamily: 'Helvetica' },
  metaValue: { color: '#1a1a1a', fontFamily: 'Helvetica-Bold' },
  sectionLabel: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#777',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  block: { marginBottom: 16 },
  primary: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sub: { fontSize: 9, color: '#555' },
  descText: { fontSize: 10, lineHeight: 1.4 },
  amountTable: { borderTop: '0.5pt solid #1a1a1a', borderBottom: '0.5pt solid #1a1a1a', marginTop: 8 },
  amountRow: { flexDirection: 'row', paddingVertical: 6 },
  amountValue: { width: 120, textAlign: 'right', fontFamily: 'Courier', fontSize: 10, paddingRight: 4 },
  totalRow: { flexDirection: 'row', paddingVertical: 8, borderTop: '0.5pt solid #aaa' },
  totalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 11, paddingLeft: 4 },
  totalValue: { width: 120, textAlign: 'right', fontFamily: 'Courier-Bold', fontSize: 12, paddingRight: 4 },
  footerNote: { marginTop: 28, fontSize: 9, color: '#555' },
  footerLine: { marginBottom: 2 },
  pageFooter: {
    position: 'absolute', fontSize: 7.5, bottom: 24, left: 48, right: 48,
    textAlign: 'center', color: '#999', fontFamily: 'Courier',
  },
})

export interface VoucherSourceData {
  pool_label: string
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

export interface VoucherDocData {
  id: string
  voucher_no: string | null
  voucher_type: string
  direction: string
  status: string
  amount: number
  payment_date: string | null
  created_at: string
  payee_name: string
  payee_sub: string | null
  bank_label: string | null
  description: string | null
  notes: string | null
  payment_reference: string | null
  sources: VoucherSourceData[]
  /** Immutable contribution snapshots for this statutory PV; absent for legacy vouchers. */
  statutory_coverage?: StatutoryCoverageData[]
  /** Recorded salary components and receiving accounts; legacy bank snapshots may be absent. */
  salary_payments?: SalaryPaymentData[]
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

function fmtMoney(v: number): string {
  if (v === 0) return '—'
  const abs = Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

function VoucherPage({ v }: { v: VoucherDocData }) {
  const generatedAt = dayjs().format('YYYY-MM-DD HH:mm')
  const isCredit = v.direction === 'credit'
  const title = isCredit ? 'OFFICIAL RECEIPT' : 'PAYMENT VOUCHER'
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.letterhead}>
        <Text style={styles.brand}>HOUZS Venture Holdings Sdn. Bhd.</Text>
        <Text style={styles.brandSub}>Internal banking · Shared services · Director salary distribution</Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.docTitle}>{title}</Text>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>No.  </Text>
            <Text style={styles.metaValue}>{v.voucher_no ?? v.id.slice(0, 8)}</Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Date  </Text>
            <Text style={styles.metaValue}>
              {dayjs(v.payment_date ?? v.created_at).format('DD MMM YYYY')}
            </Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Type  </Text>
            <Text style={styles.metaValue}>{v.voucher_type.replace(/_/g, ' ')}</Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Status  </Text>
            <Text style={styles.metaValue}>{v.status.toUpperCase()}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>{isCredit ? 'Received from' : 'Pay to'}</Text>
        <Text style={styles.primary}>{v.payee_name}</Text>
        {v.payee_sub ? <Text style={styles.sub}>{v.payee_sub}</Text> : null}
      </View>

      {v.bank_label ? (
        <View style={styles.block}>
          <Text style={styles.sectionLabel}>{isCredit ? 'Receive into' : 'Pay from'}</Text>
          <Text style={styles.descText}>{v.bank_label}</Text>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>Description</Text>
        <Text style={styles.descText}>{v.description ?? '—'}</Text>
      </View>

      <View>
        <Text style={styles.sectionLabel}>{isCredit ? 'Credited to' : 'Deducted from'}</Text>
        <View style={styles.amountTable}>
          <View style={[styles.amountRow, { backgroundColor: '#eee', borderBottom: '0.5pt solid #aaa' }]}>
            <Text style={{ flex: 1, paddingLeft: 4, fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>POOL / DEPARTMENT</Text>
            <Text style={{ width: 150, fontFamily: 'Helvetica-Bold', fontSize: 8.5 }}>ACCOUNT</Text>
            <Text style={[styles.amountValue, { fontFamily: 'Helvetica-Bold', fontSize: 8.5 }]}>AMOUNT (RM)</Text>
          </View>
          {v.sources.length > 0 ? v.sources.map((s, i) => (
            <View key={i} style={[styles.amountRow, { borderBottom: '0.5pt solid #ddd' }]}>
              <Text style={{ flex: 1, paddingLeft: 4, fontSize: 10 }}>{s.pool_label}</Text>
              <Text style={{ width: 150, fontSize: 9, color: '#555' }}>{s.account_label ?? '—'}</Text>
              <Text style={styles.amountValue}>{fmtMoney(s.amount)}</Text>
            </View>
          )) : (
            <View style={[styles.amountRow, { borderBottom: '0.5pt solid #ddd' }]}>
              <Text style={{ flex: 1, paddingLeft: 4, fontSize: 10 }}>{isCredit ? 'Received' : 'Paid'}</Text>
              <Text style={{ width: 150 }}> </Text>
              <Text style={styles.amountValue}>{fmtMoney(v.amount)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL (RM)</Text>
            <Text style={styles.totalValue}>{fmtMoney(v.amount)}</Text>
          </View>
        </View>
      </View>

      {v.payment_reference || v.notes ? (
        <View style={styles.footerNote}>
          {v.payment_reference ? (
            <Text style={styles.footerLine}>
              <Text style={styles.metaLabel}>Reference: </Text>
              <Text>{v.payment_reference}</Text>
            </Text>
          ) : null}
          {v.notes ? (
            <Text style={styles.footerLine}>
              <Text style={styles.metaLabel}>Notes: </Text>
              <Text>{v.notes}</Text>
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.pageFooter} fixed>
        HOUZS Venture Holdings Sdn. Bhd. · Generated {generatedAt} · {v.voucher_no ?? ''}
      </Text>
    </Page>
  )
}

function StatutoryCoveragePages({ v }: { v: VoucherDocData }) {
  const lines = v.statutory_coverage ?? []
  const people = new Set(lines.map((line) => `${line.scope}:${line.payroll_row_id}`)).size
  const periods = Array.from(new Set(lines.map((line) => dayjs(line.period_month).format('MMMM YYYY')))).join(' / ')
  return (
    <Page size="A4" style={styles.page}>
      <View fixed>
        <View style={[styles.letterhead, { marginBottom: 16 }]}>
          <Text style={styles.brand}>HOUZS Venture Holdings Sdn. Bhd.</Text>
          <Text style={[styles.primary, { marginTop: 12 }]}>Statutory contribution details</Text>
          <Text style={styles.sub}>{v.voucher_no ?? v.id.slice(0, 8)} - {v.payee_name} - {periods}</Text>
          <Text style={[styles.sub, { marginTop: 4 }]}>{people} {people === 1 ? 'person' : 'people'} - recorded when this PV was generated</Text>
        </View>
        <View style={[styles.amountRow, { backgroundColor: '#eee', borderTop: '0.5pt solid #aaa', borderBottom: '0.5pt solid #aaa' }]}>
          <Text style={{ width: '40%', paddingLeft: 4, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>EMPLOYEE</Text>
          <Text style={{ width: '25%', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>DEPARTMENT</Text>
          <Text style={{ width: '12%', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>SCHEME</Text>
          <Text style={{ width: '23%', paddingRight: 4, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>CONTRIBUTION (RM)</Text>
        </View>
      </View>
      {lines.map((line) => (
        <View key={line.id} wrap={false} style={[styles.amountRow, { borderBottom: '0.5pt solid #ddd' }]}>
          <View style={{ width: '40%', paddingLeft: 4, paddingRight: 8 }}>
            <Text style={{ fontSize: 9, lineHeight: 1.3 }}>{line.employee_name}</Text>
            {line.employee_code ? <Text style={{ fontSize: 8, color: '#777', marginTop: 2 }}>{line.employee_code}</Text> : null}
          </View>
          <Text style={{ width: '25%', paddingRight: 8, fontSize: 9, lineHeight: 1.3 }}>{line.department_name}</Text>
          <Text style={{ width: '12%', fontSize: 9 }}>{line.scheme}</Text>
          <Text style={{ width: '23%', textAlign: 'right', paddingRight: 4, fontFamily: 'Courier', fontSize: 9 }}>{fmtMoney(line.amount)}</Text>
        </View>
      ))}
      <View wrap={false} style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL CONTRIBUTION (RM)</Text>
        <Text style={styles.totalValue}>{fmtMoney(lines.reduce((sum, line) => sum + line.amount, 0))}</Text>
      </View>
      <Text style={styles.pageFooter} fixed render={({ pageNumber, totalPages }) => `${v.voucher_no ?? ''} - Statutory contribution details - ${pageNumber} / ${totalPages}`} />
    </Page>
  )
}

function SalaryPaymentPages({ v }: { v: VoucherDocData }) {
  const lines = v.salary_payments ?? []
  const people = new Set(lines.map(line => `${line.scope}:${line.payroll_row_id}`)).size
  const periods = Array.from(new Set(lines.map(line => dayjs(line.period_month).format('MMMM YYYY')))).join(' / ')
  return (
    <Page size="A4" style={styles.page}>
      <View fixed>
        <View style={[styles.letterhead, { marginBottom: 16 }]}>
          <Text style={styles.brand}>HOUZS Venture Holdings Sdn. Bhd.</Text>
          <Text style={[styles.primary, { marginTop: 12 }]}>Salary payment details</Text>
          <Text style={styles.sub}>{v.voucher_no ?? v.id.slice(0, 8)} - {periods}</Text>
          <Text style={[styles.sub, { marginTop: 4 }]}>{people} {people === 1 ? 'person' : 'people'} - receiving accounts recorded when this PV was generated</Text>
        </View>
        <View style={[styles.amountRow, { backgroundColor: '#eee', borderTop: '0.5pt solid #aaa', borderBottom: '0.5pt solid #aaa' }]}>
          <Text style={{ width: '34%', paddingLeft: 4, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>EMPLOYEE / DEPARTMENT</Text>
          <Text style={{ width: '22%', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>PAYMENT</Text>
          <Text style={{ width: '27%', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>RECEIVING ACCOUNT</Text>
          <Text style={{ width: '17%', paddingRight: 4, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 8 }}>AMOUNT (RM)</Text>
        </View>
      </View>
      {lines.map(line => (
        <View key={line.id} wrap={false} style={[styles.amountRow, { borderBottom: '0.5pt solid #ddd' }]}>
          <View style={{ width: '34%', paddingLeft: 4, paddingRight: 8 }}>
            <Text style={{ fontSize: 9, lineHeight: 1.3 }}>{line.employee_name}</Text>
            {line.employee_code ? <Text style={{ fontSize: 8, color: '#777', marginTop: 2 }}>{line.employee_code}</Text> : null}
            <Text style={{ fontSize: 8, color: '#555', marginTop: 2 }}>{line.department_name ?? '-'}</Text>
          </View>
          <Text style={{ width: '22%', paddingRight: 8, fontSize: 9, lineHeight: 1.3 }}>{salaryPaymentLabel(line.salary_component)}</Text>
          <View style={{ width: '27%', paddingRight: 8 }}>
            {recipientAccountLabel(line.recipient_account) ? <Text style={{ fontSize: 8, color: '#777', marginBottom: 2 }}>{recipientAccountLabel(line.recipient_account)}</Text> : null}
            {line.bank_name && line.bank_account_no ? (
              <>
                <Text style={{ fontSize: 9, lineHeight: 1.3 }}>{line.bank_name}</Text>
                <Text style={{ fontSize: 8, fontFamily: 'Courier', marginTop: 2 }}>{line.bank_account_no}</Text>
              </>
            ) : <Text style={{ fontSize: 8, color: '#777' }}>Bank details not recorded</Text>}
          </View>
          <Text style={{ width: '17%', textAlign: 'right', paddingRight: 4, fontFamily: 'Courier', fontSize: 9 }}>{fmtMoney(line.net)}</Text>
        </View>
      ))}
      <View wrap={false} style={styles.totalRow}>
        <Text style={styles.totalLabel}>TOTAL SALARY PAYMENT (RM)</Text>
        <Text style={styles.totalValue}>{fmtMoney(lines.reduce((sum, line) => sum + line.net, 0))}</Text>
      </View>
      <Text style={styles.pageFooter} fixed render={({ pageNumber, totalPages }) => `${v.voucher_no ?? ''} - Salary payment details - ${pageNumber} / ${totalPages}`} />
    </Page>
  )
}

export function VoucherDocPdf({ vouchers }: { vouchers: VoucherDocData[] }): React.ReactElement {
  return (
    <Document>
      {vouchers.map((v) => (
        <React.Fragment key={v.id}>
          <VoucherPage v={v} />
          {v.statutory_coverage?.length ? <StatutoryCoveragePages v={v} /> : null}
          {v.salary_payments?.length ? <SalaryPaymentPages v={v} /> : null}
        </React.Fragment>
      ))}
    </Document>
  )
}
