import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { pdfText } from './audit'
import { addDays, dmy, includedOf, lineCalc, lineExtrasWords, quoteTotals, rm, termOf, type QuoteCore } from './quotes'

// A quotation's client PDF (docs/design_handoff_product_builder/ › the client quotation): what the subsidiary receives —
// HOUZS Marketing, the quotation's number, Prepared for · Date · Valid until, each line (its est. delivery, what it
// includes and its remark, its term, its amount), Subtotal · Discount · Total and the notes. No cost or margin anywhere.
// Paper, in Helvetica as every portal PDF: its words through pdfText.

export interface QuotePdfProps {
  quote: QuoteCore & { no: string }
}

const INK = '#33241b'
const TEXT2 = '#4a403a'
const MUTED = '#756456'
const LINE = '#ece7e0'
const ORANGE = '#EC9B55'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9.5, padding: 40, paddingHorizontal: 44, color: INK },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  tile: { width: 26, height: 26, borderRadius: 6, backgroundColor: ORANGE, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  tileH: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#2b1f17' },
  brand: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  kicker: { color: MUTED, marginTop: 2 },
  grow: { flexGrow: 1 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 19, textAlign: 'right' },
  no: { fontSize: 8.5, color: MUTED, textAlign: 'right', marginTop: 3 },
  band: { flexDirection: 'row', borderTop: `0.75pt solid ${LINE}`, borderBottom: `0.75pt solid ${LINE}`, paddingVertical: 10, marginBottom: 18 },
  bandCell: { flex: 1, paddingRight: 12 },
  bandK: { fontSize: 8, color: MUTED, marginBottom: 2 },
  bandV: { fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', paddingVertical: 9, borderBottom: `0.75pt solid ${LINE}` },
  rowHead: { flexDirection: 'row', paddingVertical: 6, borderBottom: `1.2pt solid ${INK}`, fontFamily: 'Helvetica-Bold', fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  cProduct: { width: '30%', paddingRight: 8 },
  cInc: { width: '36%', paddingRight: 8 },
  cTerm: { width: '18%', paddingRight: 8, color: TEXT2 },
  cAmt: { width: '16%', textAlign: 'right' },
  name: { fontFamily: 'Helvetica-Bold' },
  eta: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  inc: { color: TEXT2 },
  remark: { fontSize: 8.5, color: MUTED, fontFamily: 'Helvetica-Oblique', marginTop: 3 },
  extra: { fontSize: 8.5, color: TEXT2, marginTop: 3 },
  totals: { alignSelf: 'flex-end', width: 220, marginTop: 16 },
  tRow: { flexDirection: 'row', marginBottom: 5 },
  tK: { color: TEXT2 },
  total: { flexDirection: 'row', paddingTop: 6, borderTop: `1.2pt solid ${INK}`, fontFamily: 'Helvetica-Bold', fontSize: 11 },
  notes: { marginTop: 20, color: TEXT2, lineHeight: 1.45 },
})

export function QuotePdf({ quote: q }: QuotePdfProps) {
  const t = quoteTotals(q)
  const T = pdfText
  return (
    <Document title={`${q.no} — Quotation`} author="HOUZS Marketing">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View style={s.tile}><Text style={s.tileH}>H</Text></View>
          <View>
            <Text style={s.brand}>HOUZS Marketing</Text>
            <Text style={s.kicker}>Marketing services</Text>
          </View>
          <View style={s.grow} />
          <View>
            <Text style={s.title}>Quotation</Text>
            <Text style={s.no}>{q.no}</Text>
          </View>
        </View>
        <View style={s.band}>
          <View style={s.bandCell}>
            <Text style={s.bandK}>Prepared for</Text>
            <Text style={s.bandV}>{T(q.client || '—')}</Text>
            {q.contact ? <Text>{T(`Attn: ${q.contact}`)}</Text> : null}
          </View>
          <View style={s.bandCell}><Text style={s.bandK}>Date</Text><Text style={s.bandV}>{dmy(q.date)}</Text></View>
          <View style={s.bandCell}><Text style={s.bandK}>Valid until</Text><Text style={s.bandV}>{q.date ? dmy(addDays(q.date, q.valid)) : '—'}</Text></View>
        </View>
        <View style={s.rowHead}>
          <Text style={s.cProduct}>Product</Text><Text style={s.cInc}>What&apos;s included</Text><Text style={s.cTerm}>Term</Text><Text style={s.cAmt}>Amount</Text>
        </View>
        {q.lines.map(l => (
          <View key={l.key} style={s.row} wrap={false}>
            <View style={s.cProduct}>
              <Text style={s.name}>{T(l.name)}</Text>
              {l.eta ? <Text style={s.eta}>{`Est. delivery ${dmy(l.eta)}`}</Text> : null}
            </View>
            <View style={s.cInc}>
              <Text style={s.inc}>{T(includedOf(l))}</Text>
              {lineExtrasWords(l, true) ? <Text style={s.extra}>{T(lineExtrasWords(l, true))}</Text> : null}
              {l.remark ? <Text style={s.remark}>{T(l.remark)}</Text> : null}
            </View>
            {/* "RM 5,100" never breaks between its two parts. */}
            <Text style={s.cTerm}>{T(termOf(l)).replace(/RM /g, 'RM ')}</Text>
            <Text style={s.cAmt}>{rm(lineCalc(l).amount)}</Text>
          </View>
        ))}
        <View style={s.totals} wrap={false}>
          <View style={s.tRow}><Text style={s.tK}>Subtotal</Text><View style={s.grow} /><Text>{rm(t.sub)}</Text></View>
          {t.disc ? <View style={s.tRow}><Text style={s.tK}>Discount {t.disc}%</Text><View style={s.grow} /><Text>-{rm(t.sub - t.total)}</Text></View> : null}
          <View style={s.total}><Text>Total</Text><View style={s.grow} /><Text>{rm(t.total)}</Text></View>
        </View>
        {q.note.trim() ? (
          <View style={s.notes} wrap={false}>
            <Text style={s.bandK}>Notes</Text>
            <Text>{T(q.note)}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  )
}
