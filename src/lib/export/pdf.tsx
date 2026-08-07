import React from 'react'
import {
  Document, Page, Text, View, StyleSheet, pdf,
} from '@react-pdf/renderer'
import dayjs from 'dayjs'

export type PdfOrientation = 'portrait' | 'landscape'

export interface PdfColumn {
  label: string
  width: number  // in points (1pt = 1/72 inch); A4 portrait usable = ~520pt
  align?: 'left' | 'right'
}

/**
 * Format a numeric cell value as money: negatives parenthesised, zero as em-dash.
 * Mirrors the Excel default number format `#,##0.00;(#,##0.00);—`.
 */
function fmtMoney(v: number): string {
  if (v === 0) return '—'
  const abs = Math.abs(v).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return v < 0 ? `(${abs})` : abs
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    padding: 36,
    color: '#1a1a1a',
  },
  header: {
    fontSize: 10,
    marginBottom: 4,
    fontFamily: 'Helvetica-Oblique',
    color: '#555',
  },
  title: {
    fontSize: 16,
    marginBottom: 2,
    fontFamily: 'Helvetica-Bold',
  },
  subtitle: {
    fontSize: 10,
    marginBottom: 12,
    color: '#555',
  },
  sectionHead: {
    marginTop: 12,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#555',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    borderTop: '0.5pt solid #aaa',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid #ddd',
    minHeight: 14,
  },
  rowAlt: {
    backgroundColor: '#f7f7f6',
  },
  headerRow: {
    backgroundColor: '#eee',
    borderBottom: '0.5pt solid #aaa',
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    color: '#333',
  },
  cell: {
    padding: 4,
    fontSize: 9,
  },
  cellNum: {
    fontFamily: 'Courier',
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    fontSize: 8,
    bottom: 16,
    left: 36,
    right: 36,
    textAlign: 'center',
    color: '#888',
    fontFamily: 'Courier',
  },
})

interface PdfDocumentProps {
  title: string
  subtitle?: string
  periodLabel: string
  orientation?: PdfOrientation
  children?: React.ReactNode
}

export function PdfDocument({
  title, subtitle, periodLabel, orientation = 'portrait', children,
}: PdfDocumentProps): React.ReactElement {
  const generatedAt = dayjs().format('YYYY-MM-DD HH:mm')
  return (
    <Document>
      <Page size="A4" orientation={orientation} style={styles.page}>
        <Text style={styles.header}>
          HOUZS Venture Sdn Bhd · {title} · {periodLabel}
        </Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Generated ${generatedAt} · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}

export function PdfSectionHead({ label }: { label: string }): React.ReactElement {
  return <Text style={styles.sectionHead}>{label}</Text>
}

// Per-row kind for grouped tables. 'group' = a shaded, bold header/subtotal row
// (e.g. a customer); 'detail' = a plain white sub-row under it; 'total' = the
// heavy grand-total row. When rowKinds is omitted the table falls back to plain
// zebra striping.
// The 'section*' kinds render row[0] as ONE full-width band (no column cells,
// so long titles never wrap inside the first column): 'section' = neutral,
// 'sectionPositive' = green (e.g. TO COLLECT), 'sectionWarning' = amber
// (e.g. TO REPAY).
export type PdfRowKind =
  | 'group'
  | 'detail'
  | 'total'
  | 'section'
  | 'sectionPositive'
  | 'sectionWarning'

const SECTION_STYLES: Record<string, { bg: string; color: string }> = {
  section: { bg: '#dde3ea', color: '#2c3540' },
  sectionPositive: { bg: '#e3efe4', color: '#2f5d33' },
  sectionWarning: { bg: '#f6ead9', color: '#8a5a1f' },
}

export function PdfTable({
  columns, rows, numberFormat = 'plain', rowKinds, repeatHeader = false,
}: {
  columns: PdfColumn[]
  rows: (string | number | null)[][]
  numberFormat?: 'money' | 'plain'
  rowKinds?: PdfRowKind[]
  /** Repeat the column-header row at the top of every page (react-pdf
   *  `fixed`), not just the first. */
  repeatHeader?: boolean
}): React.ReactElement {
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headerRow]} fixed={repeatHeader}>
        {columns.map((c, i) => (
          <View key={i} style={{ width: c.width, padding: 4 }}>
            <Text style={{ textAlign: c.align ?? 'left', fontSize: 8.5 }}>{c.label}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => {
        const kind = rowKinds?.[ri]
        if (kind && SECTION_STYLES[kind]) {
          const s = SECTION_STYLES[kind]
          return (
            <View
              key={ri}
              style={[styles.row, { backgroundColor: s.bg, borderBottom: '0.5pt solid #b0b4ba' }]}
            >
              <View style={{ padding: 4, width: columns.reduce((w, c) => w + c.width, 0) }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: s.color }}>
                  {String(row[0] ?? '')}
                </Text>
              </View>
            </View>
          )
        }
        const rowStyle =
          kind === 'group'
            ? { backgroundColor: '#e3e6ea', borderBottom: '0.5pt solid #b0b4ba' }
            : kind === 'total'
              ? { backgroundColor: '#d3d7dc', borderTop: '0.75pt solid #9aa0a6' }
              : kind === 'detail'
                ? {} // white — sub-item, so the shaded group rows stand out
                : ri % 2 === 1
                  ? styles.rowAlt
                  : {}
        const emphasize = kind === 'group' || kind === 'total'
        return (
          <View key={ri} style={[styles.row, rowStyle]}>
            {columns.map((c, ci) => {
              const v = row[ci]
              let text: string
              if (v === null || v === undefined) {
                text = ''
              } else if (typeof v === 'number') {
                text = numberFormat === 'money' ? fmtMoney(v) : v.toLocaleString('en-MY')
              } else {
                text = String(v)
              }
              const isNum = typeof v === 'number'
              return (
                <View key={ci} style={{ width: c.width, padding: 4 }}>
                  <Text style={{
                    fontSize: 9,
                    textAlign: c.align ?? 'left',
                    fontFamily: isNum
                      ? (emphasize ? 'Courier-Bold' : 'Courier')
                      : (emphasize ? 'Helvetica-Bold' : 'Helvetica'),
                  }}>
                    {text}
                  </Text>
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

export async function renderPdfBuffer(element: React.ReactElement): Promise<Buffer> {
  const instance = pdf(element as Parameters<typeof pdf>[0])
  const blob = await instance.toBuffer()
  // toBuffer in Node returns a NodeJS.ReadableStream in @react-pdf/renderer 4.x.
  // Some patch versions may return a Buffer directly — handle both.
  if (blob && typeof (blob as unknown as { on: unknown }).on === 'function') {
    return await streamToBuffer(blob as unknown as NodeJS.ReadableStream)
  }
  return blob as unknown as Buffer
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}
