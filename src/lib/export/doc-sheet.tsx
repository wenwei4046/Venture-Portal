import React from 'react'
import { Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { officeDay, officeTime } from '@/lib/office-time'

// The documents' one sheet (2026-10-15, the Finance revamp v2 — README §3 and
// `prototype/Finance Documents v2.dc.html`, P01–P04): A4 portrait, one sans
// face, no fills — the title left and the walnut H right, the meta list, the
// issuer beside the counter-party, the headline with its summary, the items
// under a 1pt black rule, the totals block on the right, then the document's
// own blocks (payment details, the approval list, signature lines) and the
// footer — its number and headline, *Page N of M* — on every page. An invoice,
// a receipt, a payment voucher and a credit note are drawn with these parts.
//
// The design is in CSS pixels on an A4 sheet (793.7px wide) with its type in
// points; react-pdf works in points, so every pixel measure here is × 0.75
// and every type size is the design's own. Inter maps to Helvetica (the README:
// "map Inter → Helvetica if you don't embed Inter"), 600 to Helvetica-Bold.
// Only width, margin, padding, border, flexGrow and `flex: 1` set the layout —
// what `src/lib/export/pdf.test.ts` proves survives (no height, no gap, no
// numeric flexBasis, no auto margin).

const INK = '#000000'
const BODY = '#1a1a1a'
const SOFT = '#4A4A4A'
const LABEL = '#6B6B6B'
const FAINT = '#8A8A8A'
const RULE = '#E6E6E6'
const WALNUT = '#5A3E2B'
const CREAM = '#F7EFE6'
const px = (n: number) => n * 0.75

/** The issuer's block: the company, then its line of work (the design's; the email waits until the user names it — finance-view.md). */
export const ISSUER = {
  name: 'HOUZS Venture Holdings Sdn. Bhd.',
  lines: ['Internal banking · Shared services', 'Director salary distribution'],
}

/** Where to pay an invoice — the account every invoice has printed since 2026-08. */
export const PAYMENT_DETAILS = [
  { label: 'Account name', value: 'Houzs Venture Holding Sdn Bhd' },
  { label: 'Bank', value: 'Hong Leong Bank Berhad' },
  { label: 'Account no.', value: '23600599248', strong: true },
]

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    lineHeight: 1.45,
    color: BODY,
    paddingTop: px(52),
    paddingLeft: px(56),
    paddingRight: px(56),
    // The footer is fixed to the foot; the content stops above it.
    paddingBottom: px(34) + 30,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 22, letterSpacing: -0.22, color: INK, lineHeight: 1.2 },
  tile: { width: px(36), paddingTop: px(10), paddingBottom: px(10), borderRadius: px(9), backgroundColor: WALNUT, alignItems: 'center' },
  tileText: { fontFamily: 'Helvetica-Bold', fontSize: px(16), lineHeight: 1, color: CREAM },
  meta: { marginTop: px(16) },
  metaRow: { flexDirection: 'row', marginBottom: px(3) },
  metaLabel: { width: px(110), marginRight: px(16), color: LABEL },
  metaValue: { color: INK },
  strong: { fontFamily: 'Helvetica-Bold', color: INK },
  parties: { flexDirection: 'row', marginTop: px(28) },
  party: { flex: 1 },
  partyGap: { width: px(32) },
  soft: { color: SOFT },
  headline: { marginTop: px(34), fontFamily: 'Helvetica-Bold', fontSize: 15, letterSpacing: -0.15, color: INK, lineHeight: 1.25 },
  summary: { marginTop: px(6), color: SOFT },
  items: { marginTop: px(28) },
  itemsHead: { flexDirection: 'row', paddingBottom: px(6), borderBottomWidth: px(1), borderBottomColor: BODY, borderBottomStyle: 'solid', fontSize: 8, color: LABEL },
  itemRow: { flexDirection: 'row', paddingTop: px(10), paddingBottom: px(10), borderBottomWidth: px(1), borderBottomColor: RULE, borderBottomStyle: 'solid' },
  groupRow: { flexDirection: 'row', paddingTop: px(10), paddingBottom: px(4) },
  grow: { flex: 1 },
  col: { marginLeft: px(12) },
  right: { textAlign: 'right' },
  second: { color: LABEL },
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: px(6) },
  totals: { width: px(280) },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: px(7), paddingBottom: px(7), borderBottomWidth: px(1), borderBottomColor: RULE, borderBottomStyle: 'solid' },
  totalLast: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: px(7), paddingBottom: px(7), fontFamily: 'Helvetica-Bold', color: INK },
  block: { marginTop: px(30), paddingTop: px(14), borderTopWidth: px(1), borderTopColor: RULE, borderTopStyle: 'solid' },
  blockList: { marginTop: px(6) },
  note: { marginTop: px(8), color: LABEL },
  faint: { color: FAINT },
  spacer: { flexGrow: 1 },
  signs: { flexDirection: 'row', marginBottom: px(22) },
  sign: { flex: 1 },
  signLine: { paddingTop: px(36), borderBottomWidth: px(1), borderBottomColor: BODY, borderBottomStyle: 'solid' },
  signCaption: { marginTop: px(6), fontSize: 8, color: LABEL },
  footer: {
    position: 'absolute',
    left: px(56),
    right: px(56),
    bottom: px(34),
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: px(10),
    borderTopWidth: px(1),
    borderTopColor: RULE,
    borderTopStyle: 'solid',
    fontSize: 7.5,
    color: FAINT,
  },
  footerLeft: { flex: 1, marginRight: px(16) },
})

export const docStyles = s

// ── Words the documents share ──

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "RM 63,440.00"; a negative "–RM 220.40" (an en dash: Helvetica's WinAnsi has no minus sign). */
export function docMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < -0.004 ? `–RM ${abs}` : `RM ${abs}`
}

/** "12 October 2026" — a calendar day as the documents write it. */
export function docDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return `${d} ${MONTH[m - 1]} ${y}`
}

/** "October 2026" — a month. */
export function docMonth(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  return y && m ? `${MONTH[m - 1]} ${y}` : null
}

/** "Oct 1 – Oct 31, 2026" — a month as a line's period. */
export function docPeriod(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  if (!y || !m) return null
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${MON[m - 1]} 1 – ${MON[m - 1]} ${last}, ${y}`
}

/** "6 Oct 2026, 09:12" — an instant on the office's clock. */
export function docStamp(at: string | null | undefined): string | null {
  if (!at) return null
  return officeTime(at).format('D MMM YYYY, HH:mm')
}

/** The office's day an instant falls on, as a calendar day. */
export function docOfficeDay(at: string | null | undefined): string | null {
  if (!at) return null
  return docDay(officeDay(at).format('YYYY-MM-DD'))
}

// ── The parts ──

/** One document's page: its title and the H, what goes between, the footer on every page it runs to. */
export function DocPage({ title, footer, children }: { title: string; footer: string; children: React.ReactNode }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.top}>
        <Text style={s.title}>{title}</Text>
        <View style={s.tile}>
          <Text style={s.tileText}>H</Text>
        </View>
      </View>
      {children}
      <View style={s.footer} fixed>
        <Text style={s.footerLeft}>{footer}</Text>
        <Text render={({ subPageNumber, subPageTotalPages }) => `Page ${subPageNumber} of ${subPageTotalPages}`} />
      </View>
    </Page>
  )
}

export interface DocLine {
  label: string
  value: string
  /** The number: 600. */
  strong?: boolean
  /** Not yet: the faint grey. */
  faint?: boolean
}

/** A label column (110px) beside its values — the meta list, the payment details, the approval list. */
export function DocList({ lines, style }: { lines: DocLine[]; style?: object }) {
  return (
    <View style={style}>
      {lines.map((l, i) => (
        <View key={i} style={s.metaRow}>
          <Text style={s.metaLabel}>{l.label}</Text>
          <Text style={l.strong ? s.strong : l.faint ? s.faint : s.metaValue}>{l.value}</Text>
        </View>
      ))}
    </View>
  )
}

/** The document's meta list under the title. */
export function DocMeta({ lines }: { lines: DocLine[] }) {
  return <DocList lines={lines} style={s.meta} />
}

/** The issuer beside the counter-party: a bold first line, the rest soft. */
export function DocParties({ counter }: { counter: { heading: string; lines: string[] } }) {
  return (
    <View style={s.parties}>
      <View style={s.party}>
        <Text style={s.strong}>{ISSUER.name}</Text>
        {ISSUER.lines.map((l) => (
          <Text key={l} style={s.soft}>
            {l}
          </Text>
        ))}
      </View>
      <View style={s.partyGap} />
      <View style={s.party}>
        <Text style={s.strong}>{counter.heading}</Text>
        {counter.lines.filter(Boolean).map((l, i) => (
          <Text key={i} style={s.soft}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  )
}

/** The headline — "RM 63,440.00 due 15 October 2026" — and what it is for under it. */
export function DocHeadline({ headline, summary }: { headline: string; summary?: string | null }) {
  return (
    <View>
      <Text style={s.headline}>{headline}</Text>
      {summary ? <Text style={s.summary}>{summary}</Text> : null}
    </View>
  )
}

export interface DocColumn {
  label: string
  /** In the design's pixels; none — the first column, which takes what is left. */
  width?: number
  align?: 'right'
}

export interface DocRow {
  /** One value a column; the first may carry a second grey line. */
  cells: string[]
  second?: string | null
  /** The last cell in ink (the amount). */
  key?: string
}

/** The items: the grey header over a 1pt black rule, a row each with a hairline under it. */
export function DocItems({ columns, rows, groups }: { columns: DocColumn[]; rows?: DocRow[]; groups?: Array<{ label: string; rows: DocRow[]; subtotal: DocRow }> }) {
  const cell = (c: DocColumn, i: number) => [i === 0 ? s.grow : { width: px(c.width ?? 0) }, i > 0 ? s.col : {}, c.align === 'right' ? s.right : {}]
  const line = (r: DocRow, k: string | number) => (
    <View key={k} style={s.itemRow} wrap={false}>
      {columns.map((c, i) =>
        i === 0 ? (
          <View key={i} style={cell(c, i)}>
            <Text style={{ color: INK }}>{r.cells[0]}</Text>
            {r.second ? <Text style={s.second}>{r.second}</Text> : null}
          </View>
        ) : (
          <Text key={i} style={[...cell(c, i), i === columns.length - 1 ? { color: INK } : {}]}>
            {r.cells[i] ?? ''}
          </Text>
        ),
      )}
    </View>
  )
  return (
    <View style={s.items}>
      <View style={s.itemsHead}>
        {columns.map((c, i) => (
          <Text key={i} style={cell(c, i)}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows?.map((r, i) => line(r, i))}
      {groups?.map((g) => (
        <View key={g.label}>
          <View style={s.groupRow} wrap={false}>
            <Text style={[s.grow, s.strong]}>{g.label}</Text>
          </View>
          {g.rows.map((r, i) => line(r, `${g.label}:${i}`))}
          <View style={s.itemRow} wrap={false}>
            {columns.map((c, i) => (
              <Text key={i} style={[...cell(c, i), i === 0 || i === columns.length - 1 ? s.strong : {}]}>
                {g.subtotal.cells[i] ?? ''}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

/** The totals on the right (280px): a hairline between, the last line 600. */
export function DocTotals({ lines }: { lines: Array<{ label: string; value: string }> }) {
  return (
    <View style={s.totalsRow} wrap={false}>
      <View style={s.totals}>
      {lines.map((l, i) => (
        <View key={i} style={i === lines.length - 1 ? s.totalLast : s.totalRow}>
          <Text>{l.label}</Text>
          <Text>{l.value}</Text>
        </View>
      ))}
      </View>
    </View>
  )
}

/** A titled block under a hairline: Payment details, Approval. */
export function DocBlock({ title, lines, note, first = false }: { title: string; lines: DocLine[]; note?: string; first?: boolean }) {
  return (
    <View style={[s.block, first ? { marginTop: px(26) } : {}]} wrap={false}>
      <Text style={s.strong}>{title}</Text>
      <DocList lines={lines} style={s.blockList} />
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  )
}

/** Signature lines at the foot of the first page's content: 36px of room over a 1pt rule, the caption under it. */
export function DocSignatures({ captions }: { captions: string[] }) {
  const gap = captions.length > 2 ? px(28) : px(40)
  return (
    <>
      <View style={s.spacer} />
      <View style={s.signs} wrap={false}>
        {captions.map((c, i) => (
          <View key={i} style={[s.sign, i > 0 ? { marginLeft: gap } : {}]}>
            <View style={s.signLine} />
            <Text style={s.signCaption}>{c}</Text>
          </View>
        ))}
      </View>
    </>
  )
}
