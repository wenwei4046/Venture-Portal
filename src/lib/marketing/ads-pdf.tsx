import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { EVERY_WORDS, reportCards, type AdsEvery, type AdsKey, type AdsReport } from './ads'
import { pdfText } from './audit'
import { periodWords } from './board'

// An Ads report's PDF (⑤-3e — the user, asked whether the report should give a PDF: "can do"; the handoff's PIC Link
// writes *PDF* at each report's right): what the PIC reads on their link — the project, its days, each figure against
// the targets it was published with, its note — never who published it, never what the CRM or Meta says now. One
// document for the team (the project's page) and the PIC (their link). Paper, in Helvetica as every portal PDF
// (lib/export): its words through pdfText.

export interface AdsPdfProps {
  sub: string
  title: string
  track: string
  every: AdsEvery
  /** The setup's figures, in its order (a figure since taken off goes last). */
  figures: readonly AdsKey[]
  report: Pick<AdsReport, 'no' | 'from' | 'until' | 'values' | 'targets' | 'note'>
  /** When it was published (or published again), the office's day: "3 Nov 2026". */
  published: string
}

const INK = '#1f1a16'
const MUTED = '#6b625b'
const LINE = '#d9d4cd'
const SOFT = '#f6f4f0'
const GOOD = '#24643a'
const BAD = '#a0241e'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9.5, padding: 44, paddingBottom: 56, color: INK },
  head: { fontSize: 8.5, color: MUTED, marginBottom: 8 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 20, marginBottom: 3 },
  sub: { fontSize: 11, color: MUTED, marginBottom: 16 },
  meta: { borderTop: `0.75pt solid ${LINE}`, borderBottom: `0.75pt solid ${LINE}`, paddingVertical: 8, marginBottom: 18 },
  metaRow: { flexDirection: 'row', marginVertical: 1.5 },
  metaKey: { width: 92, color: MUTED },
  metaVal: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  cell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  // As tall as the other in its row.
  card: { flexGrow: 1, backgroundColor: SOFT, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12 },
  label: { fontSize: 9, color: MUTED },
  value: { fontFamily: 'Helvetica-Bold', fontSize: 17, marginTop: 3 },
  vs: { fontSize: 8.5, marginTop: 2 },
  sect: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8, marginBottom: 4 },
  note: { fontSize: 10, lineHeight: 1.45 },
  footer: { position: 'absolute', left: 44, right: 44, bottom: 24, flexDirection: 'row', fontSize: 7.5, color: MUTED },
  grow: { flex: 1 },
})

const t = (v: string) => pdfText(v)

export function AdsReportPdf({ sub, title, track, every, figures, report, published }: AdsPdfProps): React.ReactElement {
  const period = periodWords(report.from, report.until)
  const meta: [string, string][] = [
    ['Project', title || '—'], ['Subsidiary', sub || '—'], ['Track ID', track || '—'], ['Period', period],
    ['How often', EVERY_WORDS[every]], ['Published', published || '—'],
  ]
  const cards = reportCards(report, figures)
  return (
    <Document title={t(`Ads report #${report.no} ${track}`)} author={t('HOUZS Marketing')}>
      <Page size="A4" style={s.page}>
        <Text style={s.head}>{t('HOUZS Marketing · Ads report')}</Text>
        <Text style={s.title}>{t(`Report #${report.no}`)}</Text>
        <Text style={s.sub}>{t(`${title} · ${period}`)}</Text>
        <View style={s.meta}>
          {meta.map(([k, v]) => (
            <View key={k} style={s.metaRow}><Text style={s.metaKey}>{k}</Text><Text style={s.metaVal}>{t(v)}</Text></View>
          ))}
        </View>
        <View style={s.grid}>
          {cards.map(c => (
            <View key={c.key} style={s.cell} wrap={false}>
              <View style={s.card}>
                <Text style={s.label}>{t(c.label)}</Text>
                <Text style={s.value}>{t(c.value)}</Text>
                {c.sub ? <Text style={[s.vs, { color: c.tone === 'good' ? GOOD : c.tone === 'bad' ? BAD : MUTED }]}>{t(c.sub)}</Text> : null}
              </View>
            </View>
          ))}
        </View>
        {cards.length ? null : <Text style={s.sub}>No figures in this report.</Text>}
        {report.note ? (
          <View wrap={false}>
            <Text style={s.sect}>Note</Text>
            <Text style={s.note}>{t(report.note)}</Text>
          </View>
        ) : null}
        <View style={s.footer} fixed>
          <Text>{t(`${track} · Report #${report.no} · ${period}`)}</Text>
          <Text style={s.grow} />
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
