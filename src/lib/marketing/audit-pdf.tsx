import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { COMPANY_NAME } from '@/lib/company'
import { actionCell, AUDIT_HEADS, pdfText, type AuditRow, type ProjectLog } from './audit'

// The formal log's two PDFs (④-3b — the user's answer 21, "both"): a formal document — the project, the filter, who
// exported it and when, every record in full, numbered as on screen — and the table as the screen draws it. Paper, in
// Helvetica as every portal PDF (lib/export): its words through pdfText, which Helvetica can draw.

export interface AuditPdfProps {
  log: Pick<ProjectLog, 'track' | 'title'>
  /** The rows shown — the filter's. */
  rows: readonly AuditRow[]
  /** How many records the log holds. */
  total: number
  /** The filter as its chips read ("Person: Mei"); none — every record. */
  filter: readonly string[]
  by: string
  /** When it was exported, on the office's clock. */
  at: string
  /** A record's time whole ("2026-10-21 10:02", the office's clock). */
  whole: (at: string) => string
}

const INK = '#1f1a16'
const MUTED = '#6b625b'
const LINE = '#d9d4cd'
const SOFT = '#f6f4f0'
const NONE = '—'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 40, paddingBottom: 54, color: INK },
  head: { fontSize: 8.5, color: MUTED, marginBottom: 6 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 17, marginBottom: 2 },
  sub: { fontSize: 10.5, color: MUTED, marginBottom: 14 },
  meta: { borderTop: `0.75pt solid ${LINE}`, borderBottom: `0.75pt solid ${LINE}`, paddingVertical: 8, marginBottom: 14 },
  metaRow: { flexDirection: 'row', marginVertical: 1.5 },
  metaKey: { width: 92, color: MUTED },
  metaVal: { flex: 1 },
  record: { paddingVertical: 7, borderBottom: `0.5pt solid ${LINE}` },
  // Shaded a little past the margin, so its words stay in line with every other record's.
  recordCorr: { backgroundColor: SOFT, marginHorizontal: -6, paddingHorizontal: 6 },
  recordHead: { flexDirection: 'row', marginBottom: 2 },
  recordNo: { width: 30, fontFamily: 'Courier-Bold', fontSize: 9 },
  recordWhat: { flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 9.5 },
  recordWhen: { fontFamily: 'Courier', fontSize: 8.5, color: MUTED },
  kv: { flexDirection: 'row', marginLeft: 30, marginTop: 1.5 },
  k: { width: 70, color: MUTED },
  v: { flex: 1 },
  note: { marginLeft: 30, marginTop: 2, fontSize: 8, color: MUTED },
  footer: { position: 'absolute', left: 40, right: 40, bottom: 22, flexDirection: 'row', fontSize: 7.5, color: MUTED },
  grow: { flex: 1 },
  // The table
  tPage: { fontFamily: 'Helvetica', fontSize: 8, padding: 32, paddingBottom: 48, color: INK },
  tTitle: { fontFamily: 'Helvetica-Bold', fontSize: 14, marginBottom: 2 },
  tSub: { fontSize: 9, color: MUTED, marginBottom: 10 },
  table: { borderTop: `0.75pt solid ${LINE}`, borderLeft: `0.75pt solid ${LINE}`, borderRight: `0.75pt solid ${LINE}` },
  tr: { flexDirection: 'row', borderBottom: `0.5pt solid ${LINE}` },
  th: { backgroundColor: SOFT, fontFamily: 'Helvetica-Bold', fontSize: 7, color: MUTED, textTransform: 'uppercase' },
  td: { paddingVertical: 4, paddingHorizontal: 5 },
  mono: { fontFamily: 'Courier', fontSize: 7.5 },
  corrOf: { fontSize: 6.5, color: MUTED, marginTop: 1 },
})

/** The table's columns, in points of A4 landscape's 778 between the margins. */
const WIDTHS = [26, 88, 84, 128, 112, 226, 114] as const

const t = (v: string) => pdfText(v)
const filterWords = (f: readonly string[]) => (f.length ? f.join(' · ') : 'None — every record')

function Footer({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{t(left)}</Text>
      <Text style={s.grow} />
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )
}

/** The formal document: the project, the filter, who and when; then every record shown, in full. */
export function AuditDocPdf({ log, rows, total, filter, by, at, whole }: AuditPdfProps): React.ReactElement {
  const meta: [string, string][] = [
    ['Project', log.title || NONE], ['Track ID', log.track || NONE], ['Records', `${rows.length} of ${total}`],
    ['Filter', filterWords(filter)], ['Exported by', by || NONE], ['Exported', at],
  ]
  return (
    <Document title={t(`Audit trail ${log.track}`)} author={t(COMPANY_NAME)}>
      <Page size="A4" style={s.page}>
        <Text style={s.head}>{t(`${COMPANY_NAME} · Marketing`)}</Text>
        <Text style={s.title}>{t(`Audit trail — ${log.track}`)}</Text>
        <Text style={s.sub}>{t(log.title)}</Text>
        <View style={s.meta}>
          {meta.map(([k, v]) => (
            <View key={k} style={s.metaRow}><Text style={s.metaKey}>{k}</Text><Text style={s.metaVal}>{t(v)}</Text></View>
          ))}
        </View>
        {rows.map(r => {
          const lines: [string, string][] = [['By', r.actor], ['Stage', r.stage], ['From → To', r.fromTo], ['Reason', r.reason], ['Version', r.version]]
          return (
            <View key={r.no} style={r.corrects ? [s.record, s.recordCorr] : s.record} wrap={false}>
              <View style={s.recordHead}>
                <Text style={s.recordNo}>#{r.no}</Text>
                <Text style={s.recordWhat}>{t(actionCell(r))}</Text>
                <Text style={s.recordWhen}>{t(whole(r.at) || r.time)}</Text>
              </View>
              {lines.filter(([, v]) => v && v !== NONE).map(([k, v]) => (
                <View key={k} style={s.kv}><Text style={s.k}>{t(k)}</Text><Text style={s.v}>{t(v)}</Text></View>
              ))}
              {r.correctedIn.length ? <Text style={s.note}>{`Corrected in ${r.correctedIn.map(n => `#${n}`).join(', ')}`}</Text> : null}
            </View>
          )
        })}
        {rows.length ? null : <Text style={s.sub}>No records match this filter.</Text>}
        <Footer left={`${log.track} · Records are read-only — a mistake is corrected by a record of its own.`} />
      </Page>
    </Document>
  )
}

/** The table as the screen draws it: the same columns, a correction's *correction of #n* under its action. */
export function AuditTablePdf({ log, rows, total, filter, by, at, whole }: AuditPdfProps): React.ReactElement {
  return (
    <Document title={t(`Audit trail ${log.track}`)} author={t(COMPANY_NAME)}>
      <Page size="A4" orientation="landscape" style={s.tPage}>
        <Text style={s.head}>{t(`${COMPANY_NAME} · Marketing · Audit trail`)}</Text>
        <Text style={s.tTitle}>{t(`${log.track} — ${log.title}`)}</Text>
        <Text style={s.tSub}>{t(`${rows.length} of ${total} records · Filter: ${filterWords(filter)} · Exported by ${by || NONE}, ${at}`)}</Text>
        <View style={s.table}>
          <View style={[s.tr, s.th]}>
            {AUDIT_HEADS.map((h, i) => <Text key={h} style={[s.td, { width: WIDTHS[i] }]}>{t(h)}</Text>)}
          </View>
          {rows.map(r => (
            <View key={r.no} style={r.corrects ? [s.tr, { backgroundColor: SOFT }] : s.tr} wrap={false}>
              <Text style={[s.td, s.mono, { width: WIDTHS[0] }]}>{r.no}</Text>
              <Text style={[s.td, s.mono, { width: WIDTHS[1] }]}>{t(whole(r.at) || r.time)}</Text>
              <Text style={[s.td, { width: WIDTHS[2] }]}>{t(r.actor)}</Text>
              <View style={[s.td, { width: WIDTHS[3] }]}>
                <Text>{t(r.action)}</Text>
                {r.corrects ? <Text style={s.corrOf}>{`correction of #${r.corrects}`}</Text> : null}
              </View>
              <Text style={[s.td, { width: WIDTHS[4] }]}>{t(r.fromTo)}</Text>
              <Text style={[s.td, { width: WIDTHS[5] }]}>{t(r.reason)}</Text>
              <Text style={[s.td, s.mono, { width: WIDTHS[6] }]}>{t(r.version)}</Text>
            </View>
          ))}
        </View>
        {rows.length ? null : <Text style={s.tSub}>No records match this filter.</Text>}
        <Footer left={`${log.track} · Records are read-only — a mistake is corrected by a record of its own.`} />
      </Page>
    </Document>
  )
}
