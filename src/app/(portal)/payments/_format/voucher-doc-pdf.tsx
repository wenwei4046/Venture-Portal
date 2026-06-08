import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import dayjs from 'dayjs'

// Per-voucher document PDF. Each voucher = one A4 portrait page. Mirrors the
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

export function VoucherDocPdf({ vouchers }: { vouchers: VoucherDocData[] }): React.ReactElement {
  return (
    <Document>
      {vouchers.map((v) => (
        <VoucherPage key={v.id} v={v} />
      ))}
    </Document>
  )
}
