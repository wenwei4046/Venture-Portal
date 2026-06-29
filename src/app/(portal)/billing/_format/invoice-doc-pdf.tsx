import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import dayjs from 'dayjs'

// Per-invoice document PDF. Each invoice = one A4 portrait page. Used for
// both single-invoice download (one page) and batch (N pages, one per
// invoice). Distinct from the existing list-style PDF (statements/export)
// which renders a table of multiple invoices in a single page.

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 48, color: '#1a1a1a' },
  // Letterhead
  letterhead: { borderBottom: '1pt solid #1a1a1a', paddingBottom: 12, marginBottom: 24 },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 16 },
  brandSub: { fontFamily: 'Helvetica-Oblique', fontSize: 9, color: '#555', marginTop: 2 },
  // Header row: title + invoice meta
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  invoiceTitle: { fontFamily: 'Helvetica-Bold', fontSize: 22, letterSpacing: 1 },
  metaBlock: { textAlign: 'right' },
  metaLine: { fontSize: 9, marginBottom: 2 },
  metaLabel: { color: '#777', fontFamily: 'Helvetica' },
  metaValue: { color: '#1a1a1a', fontFamily: 'Helvetica-Bold' },
  // Bill-to
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#777',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  billTo: { marginBottom: 18 },
  billToPrimary: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  billToSub: { fontSize: 9, color: '#555' },
  // Description block
  descBlock: { marginBottom: 24, paddingTop: 4 },
  descText: { fontSize: 10, lineHeight: 1.4 },
  // Amount row
  amountTable: { borderTop: '0.5pt solid #1a1a1a', borderBottom: '0.5pt solid #1a1a1a' },
  amountRow: { flexDirection: 'row', paddingVertical: 6 },
  amountLabel: { flex: 1, fontSize: 10, paddingLeft: 4 },
  amountValue: { width: 120, textAlign: 'right', fontFamily: 'Courier', fontSize: 10, paddingRight: 4 },
  totalRow: { flexDirection: 'row', paddingVertical: 8, borderTop: '0.5pt solid #aaa' },
  totalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 11, paddingLeft: 4 },
  totalValue: { width: 120, textAlign: 'right', fontFamily: 'Courier-Bold', fontSize: 12, paddingRight: 4 },
  // Footer / reference
  footerNote: { marginTop: 28, fontSize: 9, color: '#555' },
  footerLine: { marginBottom: 2 },
  // Bank / payment details
  bankBox: { marginTop: 20, padding: 10, border: '0.5pt solid #aaa', backgroundColor: '#faf5ea' },
  bankTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
    color: '#333',
    letterSpacing: 0.5,
  },
  bankLine: { fontSize: 9.5, marginBottom: 2.5, color: '#333' },
  bankLabel: { fontFamily: 'Helvetica-Bold' },
  bankAcc: { fontFamily: 'Courier-Bold', fontSize: 10.5, color: '#000' },
  bankNote: { marginTop: 5, fontSize: 8, color: '#888' },
  pageFooter: {
    position: 'absolute',
    fontSize: 7.5,
    bottom: 24,
    left: 48,
    right: 48,
    textAlign: 'center',
    color: '#999',
    fontFamily: 'Courier',
  },
})

export interface InvoiceLineData {
  line_no: number
  description: string | null
  amount: number
  category_label: string | null
}

export interface InvoiceDocData {
  id: string
  invoice_no: string | null
  status: string
  total_amount: number
  period_month: string
  billing_mode: string
  invoice_date: string | null
  due_date: string | null
  description: string | null
  reference_no: string | null
  category_label: string | null
  // Bill-to resolved upstream
  bill_to_primary: string
  bill_to_sub: string
  // Multi-line (mig 275). When present, render as a line-items table instead
  // of the flat description block.
  lines?: InvoiceLineData[]
}

function fmtMoney(v: number): string {
  if (v === 0) return '—'
  const abs = Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

function formatBillingMode(m: string): string {
  switch (m) {
    case 'marketing_project':           return 'Marketing project'
    case 'director_office_attribution': return 'Director Office OPEX'
    case 'director_attribution':        return 'Director OPEX'
    case 'hr_attribution':              return 'HR OPEX'
    case 'finance_attribution':         return 'Finance OPEX'
    case 'venture_attribution':         return 'Venture (HV) OPEX'
    case 'non_billable':                return 'Non-billable'
    default:                            return m
  }
}

function InvoicePage({ inv }: { inv: InvoiceDocData }) {
  const generatedAt = dayjs().format('YYYY-MM-DD HH:mm')
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.letterhead}>
        <Text style={styles.brand}>HOUZS Venture Holdings Sdn. Bhd.</Text>
        <Text style={styles.brandSub}>Internal banking · Shared services · Director salary distribution</Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.invoiceTitle}>INVOICE</Text>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>No.  </Text>
            <Text style={styles.metaValue}>{inv.invoice_no ?? inv.id.slice(0, 8)}</Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Date  </Text>
            <Text style={styles.metaValue}>
              {inv.invoice_date ? dayjs(inv.invoice_date).format('DD MMM YYYY') : '—'}
            </Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Due  </Text>
            <Text style={styles.metaValue}>
              {inv.due_date ? dayjs(inv.due_date).format('DD MMM YYYY') : '—'}
            </Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Period  </Text>
            <Text style={styles.metaValue}>{dayjs(inv.period_month).format('MMMM YYYY')}</Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Status  </Text>
            <Text style={styles.metaValue}>{inv.status.toUpperCase()}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.billTo}>
        <Text style={styles.sectionLabel}>Bill to</Text>
        <Text style={styles.billToPrimary}>{inv.bill_to_primary}</Text>
        {inv.bill_to_sub ? <Text style={styles.billToSub}>{inv.bill_to_sub}</Text> : null}
      </View>

      <View>
        <Text style={styles.sectionLabel}>Mode · Category</Text>
        <Text style={[styles.descText, { marginBottom: 12 }]}>
          {formatBillingMode(inv.billing_mode)}
          {inv.category_label ? `  ·  ${inv.category_label}` : ''}
        </Text>
      </View>

      {inv.lines && inv.lines.length > 0 ? (
        <>
          {inv.description ? (
            <View style={styles.descBlock}>
              <Text style={styles.sectionLabel}>Summary</Text>
              <Text style={styles.descText}>{inv.description}</Text>
            </View>
          ) : null}
          <View style={[styles.amountTable, { marginTop: 8 }]}>
            <View style={[styles.amountRow, { backgroundColor: '#eee', borderBottom: '0.5pt solid #aaa' }]}>
              <Text style={[styles.amountLabel, { fontFamily: 'Helvetica-Bold', fontSize: 8.5 }]}>DESCRIPTION</Text>
              <Text style={[styles.amountValue, { fontFamily: 'Helvetica-Bold', fontSize: 8.5, textAlign: 'right' }]}>AMOUNT (RM)</Text>
            </View>
            {inv.lines.map((ln) => (
              <View key={ln.line_no} style={[styles.amountRow, { borderBottom: '0.5pt solid #ddd' }]}>
                <View style={{ flex: 1, paddingLeft: 4 }}>
                  <Text style={{ fontSize: 10 }}>{ln.description ?? '—'}</Text>
                  {ln.category_label ? (
                    <Text style={{ fontSize: 8, color: '#777', marginTop: 1 }}>{ln.category_label}</Text>
                  ) : null}
                </View>
                <Text style={styles.amountValue}>{fmtMoney(ln.amount)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL (RM)</Text>
              <Text style={styles.totalValue}>{fmtMoney(inv.total_amount)}</Text>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.descBlock}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.descText}>{inv.description ?? '—'}</Text>
          </View>
          <View style={styles.amountTable}>
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Subtotal (RM)</Text>
              <Text style={styles.amountValue}>{fmtMoney(inv.total_amount)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL (RM)</Text>
              <Text style={styles.totalValue}>{fmtMoney(inv.total_amount)}</Text>
            </View>
          </View>
        </>
      )}

      {inv.reference_no ? (
        <View style={styles.footerNote}>
          <Text style={styles.footerLine}>
            <Text style={styles.metaLabel}>Reference: </Text>
            <Text>{inv.reference_no}</Text>
          </Text>
        </View>
      ) : null}

      <View style={styles.bankBox}>
        <Text style={styles.bankTitle}>PAYMENT DETAILS</Text>
        <Text style={styles.bankLine}>
          <Text style={styles.bankLabel}>Account Name: </Text>
          Houzs Venture Holding Sdn Bhd
        </Text>
        <Text style={styles.bankLine}>
          <Text style={styles.bankLabel}>Bank: </Text>
          Hong Leong Bank Berhad
        </Text>
        <Text style={styles.bankLine}>
          <Text style={styles.bankLabel}>Account No.: </Text>
          <Text style={styles.bankAcc}>23600599248</Text>
        </Text>
        <Text style={styles.bankNote}>Kindly quote the invoice number as your payment reference.</Text>
      </View>

      <Text style={styles.pageFooter} fixed>
        HOUZS Venture Holdings Sdn. Bhd. · Generated {generatedAt} · {inv.invoice_no ?? ''}
      </Text>
    </Page>
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
