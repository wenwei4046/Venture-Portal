import React from 'react'
import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { reportWords, TYPE_LABEL, type BrandBillingReport, type ExportLine } from '@/lib/commission/brand-billing'
import { COMPANY_NAME } from '@/lib/company'
import { officeTime } from '@/lib/office-time'
import { REPORT_CJK_BOLD, REPORT_CJK_REGULAR } from './fonts/report-cjk'

type Style = Exclude<NonNullable<React.ComponentProps<typeof View>['style']>, readonly unknown[]>

/**
 * The Sales by Brand & Billing PDF (2026-11-11): the workbook's Summary, then
 * every record grouped by salesperson with their total — the workbook's All
 * records and per-person sheets in one, A4 landscape.
 *
 * Helvetica draws every Latin letter and figure; the Chinese headers fall
 * back to a Noto Sans SC subset of exactly those words
 * (`fonts/report-cjk.ts`, `tools/build-report-cjk-font.mjs`).
 */

const CJK = 'ReportCJK'
Font.register({
  family: CJK,
  fonts: [
    { src: REPORT_CJK_REGULAR, fontWeight: 'normal' },
    { src: REPORT_CJK_BOLD, fontWeight: 'bold' },
  ],
})
// Never hyphenate a name or a bill number across lines.
Font.registerHyphenationCallback(word => [word])

const FONT = ['Helvetica', CJK]

const styles = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 7.5, paddingTop: 28, paddingBottom: 34, paddingHorizontal: 28, color: '#1a1a1a' },
  company: { fontSize: 8, color: '#666', marginBottom: 2 },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  sub: { fontSize: 8, color: '#555', marginBottom: 10 },
  section: { fontSize: 9, fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
  table: { borderTop: '0.5pt solid #999' },
  row: { flexDirection: 'row', borderBottom: '0.5pt solid #ddd', minHeight: 13, alignItems: 'center' },
  head: { backgroundColor: '#eeeeec', borderBottom: '0.5pt solid #999', fontWeight: 'bold' },
  foot: { backgroundColor: '#f4f1ea', borderTop: '0.5pt solid #999', fontWeight: 'bold' },
  cell: { paddingHorizontal: 3, paddingVertical: 2 },
  right: { textAlign: 'right' },
  neg: { color: '#b3261e' },
  person: { fontSize: 9, fontWeight: 'bold', marginTop: 10, marginBottom: 3 },
  pageFoot: { position: 'absolute', bottom: 16, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#888' },
})

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return ''
  if (v === 0) return '–'
  const abs = Math.abs(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return `${Math.round(v * 1000) / 10}%`
}

interface Col { label: string; width: number; right?: boolean }
type Cell = { text: string; neg?: boolean }

function Table({ cols, rows, foot }: { cols: Col[]; rows: Cell[][]; foot?: Cell[] }) {
  const line = (cells: Cell[], extra?: Style, key?: React.Key) => (
    <View key={key} style={[styles.row, ...(extra ? [extra] : [])]} wrap={false}>
      {cells.map((c, i) => (
        <Text key={i} style={[styles.cell, { width: cols[i].width }, ...(cols[i].right ? [styles.right] : []), ...(c.neg ? [styles.neg] : [])]}>
          {c.text}
        </Text>
      ))}
    </View>
  )
  return (
    <View style={styles.table}>
      {line(cols.map(c => ({ text: c.label })), styles.head)}
      {rows.map((r, i) => line(r, undefined, i))}
      {foot ? line(foot, styles.foot) : null}
    </View>
  )
}

const m = (v: number | null | undefined): Cell => ({ text: fmtMoney(v), neg: (v ?? 0) < 0 })
const t = (text: string): Cell => ({ text })

const RECORD_COLS: Col[] = [
  { label: '类型', width: 66 }, { label: 'ERP 单号', width: 62 }, { label: 'Ref No.', width: 44 },
  { label: '日期', width: 42 }, { label: 'Venue', width: 92 }, { label: '顾客', width: 66 }, { label: 'Brand', width: 42 },
  { label: '整张单金额', width: 46, right: true }, { label: '我的份', width: 26, right: true },
  { label: 'Sales amount', width: 50, right: true }, { label: '佣金 %', width: 26, right: true },
  { label: '佣金', width: 44, right: true }, { label: '来源', width: 34 }, { label: '备注', width: 146 },
]

function recordCells(line: ExportLine): Cell[] {
  return [
    t(TYPE_LABEL[line.type]), t(line.erpNo), t(line.refNo), t(line.date), t(line.venue), t(line.customer), t(line.brandCode),
    m(line.wholeTotal), t(fmtPct(line.sharePct)), m(line.sales), t(fmtPct(line.rate)), m(line.commission), t(line.source), t(line.note),
  ]
}

export function BrandBillingPdf({ report }: { report: BrandBillingReport }): React.ReactElement {
  const words = reportWords(report.period)
  const tot = report.totals
  const personCols: Col[] = words.personHead.map((label, i) => ({ label, width: i === 0 ? 110 : i < 3 ? 50 : 82, right: i > 0 }))
  const brandCols: Col[] = [
    { label: words.name, width: 110 },
    ...report.brands.map(b => ({ label: b.name, width: 82, right: true })),
    { label: words.total, width: 90, right: true },
  ]
  const splitCols: Col[] = words.brandHead.map((label, i) => ({ label, width: i === 0 ? 110 : 90, right: i > 0 }))
  const billCols: Col[] = words.billHead.map((label, i) => ({ label, width: i === 0 ? 110 : 90, right: i > 0 }))
  const printed = officeTime().format('D MMM YYYY, HH:mm')

  return (
    <Document title={`${report.title} — Sales by Brand & Billing`} author={COMPANY_NAME}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.company}>{COMPANY_NAME}</Text>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.sub}>{words.summaryNote}</Text>

        <Text style={styles.section}>{words.summaryTitle}</Text>
        <Table
          cols={personCols}
          rows={report.people.map(p => [t(p.name), t(fmtPct(p.rate)), t(String(p.bills)), m(p.sales), m(p.belowDeposit), m(p.topup), m(p.upsell), m(p.drop), m(p.total)])}
          foot={[t(words.total), t(''), t(String(tot.bills)), m(tot.sales), m(tot.belowDeposit), m(tot.topup), m(tot.upsell), m(tot.drop), m(tot.total)]}
        />

        <View break>
          <Text style={styles.section}>{words.byBrandTitle}</Text>
          <Table
            cols={brandCols}
            rows={report.people.map(p => [t(p.name), ...report.brands.map(b => m(report.byBrand.get(p.staffId)?.get(b.code) ?? 0)), m(p.total)])}
            foot={[t(words.total), ...report.brandTotals.map(b => m(b.total)), m(tot.total)]}
          />
        </View>

        <View wrap={false}>
          <Text style={styles.section}>{words.brandSplitTitle}</Text>
          <Table
            cols={splitCols}
            rows={report.brandTotals.map(b => [t(b.name), m(b.sales), m(b.topup), m(b.upsell), m(b.drop), m(b.total)])}
            foot={[t(words.total), m(tot.sales), m(tot.topup), m(tot.upsell), m(tot.drop), m(tot.total)]}
          />
        </View>

        <View wrap={false}>
          <Text style={styles.section}>{words.billTitle}</Text>
          <Table
            cols={billCols}
            rows={report.brandTotals.map(b => [t(b.name), m(b.total), t(b.hcBillPct === null ? words.notSet : fmtPct(b.hcBillPct)), m(b.bill)])}
            foot={[t(words.total), m(tot.total), t(''), m(report.billTotal)]}
          />
        </View>

        <View break>
          <Text style={styles.section}>{words.recordsSheet}</Text>
          {report.people.map(p => (
            <View key={p.staffId}>
              <Text style={styles.person} minPresenceAhead={40}>{p.name} · {fmtPct(p.rate)}</Text>
              <Table
                cols={RECORD_COLS}
                rows={report.lines.filter(l => l.staffId === p.staffId).map(recordCells)}
                foot={[t(`${p.name} ${words.total}`), t(''), t(''), t(''), t(''), t(''), t(''), t(''), t(''), m(p.total), t(''), m(p.commission), t(''), t('')]}
              />
            </View>
          ))}
        </View>

        <View style={styles.pageFoot} fixed>
          <Text>{report.title} · Sales by Brand & Billing · {printed}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
