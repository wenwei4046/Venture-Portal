import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'

// Per-credit-note document PDF (CN v2, 2026-08-19) — the printable CN the
// user hands to the billed party. Mirrors invoice-doc-pdf's letterhead and
// typography so both documents read as one stationery set; differences:
// CREDIT NOTE title, "Credit to" block, the parent invoice reference, and a
// balance box (invoice total − this credit − prior receipts/credits = what
// remains payable) instead of bank payment details.

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, padding: 48, color: '#1a1a1a' },
  letterhead: { borderBottom: '1pt solid #1a1a1a', paddingBottom: 12, marginBottom: 24 },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 16 },
  brandSub: { fontFamily: 'Helvetica-Oblique', fontSize: 9, color: '#555', marginTop: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 22, letterSpacing: 1 },
  metaBlock: { textAlign: 'right' },
  metaLine: { fontSize: 9, marginBottom: 2 },
  metaLabel: { color: '#777', fontFamily: 'Helvetica' },
  metaValue: { color: '#1a1a1a', fontFamily: 'Helvetica-Bold' },
  sectionLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#777',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  creditTo: { marginBottom: 18 },
  creditToPrimary: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  creditToSub: { fontSize: 9, color: '#555' },
  descBlock: { marginBottom: 24, paddingTop: 4 },
  descText: { fontSize: 10, lineHeight: 1.4 },
  amountTable: { borderTop: '0.5pt solid #1a1a1a', borderBottom: '0.5pt solid #1a1a1a' },
  amountRow: { flexDirection: 'row', paddingVertical: 6 },
  amountLabel: { flex: 1, fontSize: 10, paddingLeft: 4 },
  amountValue: { width: 120, textAlign: 'right', fontFamily: 'Courier', fontSize: 10, paddingRight: 4 },
  totalRow: { flexDirection: 'row', paddingVertical: 8, borderTop: '0.5pt solid #aaa' },
  totalLabel: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 11, paddingLeft: 4 },
  totalValue: { width: 120, textAlign: 'right', fontFamily: 'Courier-Bold', fontSize: 12, paddingRight: 4 },
  balanceBox: { marginTop: 20, padding: 10, border: '0.5pt solid #aaa', backgroundColor: '#faf5ea' },
  balanceTitle: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
    color: '#333',
    letterSpacing: 0.5,
  },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2.5 },
  balanceLabel: { fontSize: 9.5, color: '#333' },
  balanceValue: { fontFamily: 'Courier', fontSize: 9.5, color: '#000' },
  balanceFinal: { fontFamily: 'Courier-Bold', fontSize: 10.5 },
  balanceNote: { marginTop: 5, fontSize: 8, color: '#888' },
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

export interface CreditNoteDocData {
  id: string
  credit_note_no: string | null
  status: string
  amount: number
  reason: string
  created_at: string | null
  category_label: string | null
  credit_to_primary: string
  credit_to_sub: string
  invoice_no: string | null
  invoice_date: string | null
  invoice_total: number
  /** Receipts + OTHER approved credits already against the invoice — so the
   *  box can show what remains payable after THIS credit note. */
  other_settled: number
}

function fmtMoney(v: number): string {
  const abs = Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

function CreditNotePage({ cn }: { cn: CreditNoteDocData }) {
  const generatedAt = officeTime().format('YYYY-MM-DD HH:mm')
  const remaining = Math.round((cn.invoice_total - cn.other_settled - cn.amount) * 100) / 100
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.letterhead}>
        <Text style={styles.brand}>HOUZS Venture Holdings Sdn. Bhd.</Text>
        <Text style={styles.brandSub}>Internal banking · Shared services · Director salary distribution</Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.docTitle}>CREDIT NOTE</Text>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>No.  </Text>
            <Text style={styles.metaValue}>{cn.credit_note_no ?? cn.id.slice(0, 8)}</Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Date  </Text>
            <Text style={styles.metaValue}>
              {cn.created_at ? dayjs(cn.created_at).format('DD MMM YYYY') : '—'}
            </Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Against invoice  </Text>
            <Text style={styles.metaValue}>{cn.invoice_no ?? '—'}</Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Invoice date  </Text>
            <Text style={styles.metaValue}>
              {cn.invoice_date ? dayjs(cn.invoice_date).format('DD MMM YYYY') : '—'}
            </Text>
          </Text>
          <Text style={styles.metaLine}>
            <Text style={styles.metaLabel}>Status  </Text>
            <Text style={styles.metaValue}>{cn.status.toUpperCase()}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.creditTo}>
        <Text style={styles.sectionLabel}>Credit to</Text>
        <Text style={styles.creditToPrimary}>{cn.credit_to_primary}</Text>
        {cn.credit_to_sub ? <Text style={styles.creditToSub}>{cn.credit_to_sub}</Text> : null}
      </View>

      <View style={styles.descBlock}>
        <Text style={styles.sectionLabel}>Reason</Text>
        <Text style={styles.descText}>{cn.reason}</Text>
      </View>

      <View style={styles.amountTable}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>
            Credit against invoice {cn.invoice_no ?? '—'}
            {cn.category_label ? `  ·  ${cn.category_label}` : ''}
          </Text>
          <Text style={styles.amountValue}>{fmtMoney(cn.amount)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL CREDIT (RM)</Text>
          <Text style={styles.totalValue}>{fmtMoney(cn.amount)}</Text>
        </View>
      </View>

      <View style={styles.balanceBox}>
        <Text style={styles.balanceTitle}>EFFECT ON INVOICE {cn.invoice_no ?? ''}</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Invoice total</Text>
          <Text style={styles.balanceValue}>{fmtMoney(cn.invoice_total)}</Text>
        </View>
        {cn.other_settled > 0.005 ? (
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Less: payments / credits to date</Text>
            <Text style={styles.balanceValue}>({fmtMoney(cn.other_settled)})</Text>
          </View>
        ) : null}
        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>Less: this credit note</Text>
          <Text style={styles.balanceValue}>({fmtMoney(cn.amount)})</Text>
        </View>
        <View style={[styles.balanceRow, { marginTop: 3, paddingTop: 3, borderTop: '0.5pt solid #aaa' }]}>
          <Text style={[styles.balanceLabel, { fontFamily: 'Helvetica-Bold' }]}>Balance payable (RM)</Text>
          <Text style={[styles.balanceValue, styles.balanceFinal]}>{fmtMoney(Math.max(remaining, 0))}</Text>
        </View>
        <Text style={styles.balanceNote}>
          {cn.status === 'draft'
            ? 'DRAFT — pending approval; the credit takes effect once approved.'
            : 'This credit note reduces the amount payable against the invoice above.'}
        </Text>
      </View>

      <Text style={styles.pageFooter} fixed>
        HOUZS Venture Holdings Sdn. Bhd. · Generated {generatedAt} · {cn.credit_note_no ?? ''}
      </Text>
    </Page>
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
