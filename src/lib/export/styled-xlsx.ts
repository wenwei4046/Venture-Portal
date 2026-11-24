import JSZip from 'jszip'

// A one-sheet .xlsx with formatting (2026-11-24 — the user, on the PPE listing's file: "export 出来的可以好看一点吗？").
// The SheetJS community build the other exports use writes values only — no bold, fills or borders — so this writes the
// workbook's XML itself, zipped with jszip: fonts, fills, borders, alignment and number formats per cell, merged cells,
// column widths, row heights, frozen panes, no gridlines, and a landscape page one wide. Strings go inline.

export type XBorder = 'thin' | 'medium' | 'double'

export interface XStyle {
  bold?: boolean
  italic?: boolean
  size?: number
  /** RRGGBB */
  color?: string
  /** RRGGBB */
  fill?: string
  border?: { top?: XBorder; bottom?: XBorder; left?: XBorder; right?: XBorder }
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'center' | 'bottom'
  wrap?: boolean
  /** An Excel number format, e.g. '#,##0.00' or 'dd/mm/yyyy'. */
  numFmt?: string
}

export interface XCell {
  /** A number, a string, or a date (YYYY-MM-DD, written as Excel's day number — give it a date numFmt). */
  v: string | number | null
  date?: boolean
  style?: XStyle
}

export interface XSheet {
  name: string
  rows: (XCell | null)[][]
  /** 'A1:D1' */
  merges?: string[]
  /** Characters, per column. */
  widths?: number[]
  /** Points, by row index (0-based). */
  heights?: Record<number, number>
  /** Rows and columns kept in view (0-based counts). */
  freeze?: { rows: number; cols: number }
  landscape?: boolean
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 0 → A, 26 → AA. */
export function colName(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** YYYY-MM-DD → Excel's day number (1900 system). */
export function excelDay(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

/** The styles part, and each style's index in it. */
function stylesOf(styles: XStyle[]): { xml: string; index: (s: XStyle | undefined) => number } {
  const numFmts: string[] = []
  const fonts = ['<font><sz val="10"/><name val="Arial"/></font>']
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>']
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
  const keyIndex = new Map<string, number>([['{}', 0]])
  const add = (list: string[], xml: string) => {
    const at = list.indexOf(xml)
    if (at >= 0) return at
    list.push(xml)
    return list.length - 1
  }
  for (const s of styles) {
    const key = JSON.stringify(s)
    if (keyIndex.has(key)) continue
    let numFmtId = 0
    if (s.numFmt) numFmtId = 164 + add(numFmts, s.numFmt)
    const font = `<font>${s.bold ? '<b/>' : ''}${s.italic ? '<i/>' : ''}<sz val="${s.size ?? 10}"/>${s.color ? `<color rgb="FF${s.color}"/>` : ''}<name val="Arial"/></font>`
    const fontId = add(fonts, font)
    const fillId = s.fill ? add(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0
    const b = s.border ?? {}
    const side = (name: string, v?: XBorder) => (v ? `<${name} style="${v}"><color rgb="FF8C7B6B"/></${name}>` : `<${name}/>`)
    const borderId = s.border ? add(borders, `<border>${side('left', b.left)}${side('right', b.right)}${side('top', b.top)}${side('bottom', b.bottom)}<diagonal/></border>`) : 0
    const align = s.align || s.valign || s.wrap
      ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''}${s.valign ? ` vertical="${s.valign}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>`
      : ''
    xfs.push(`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`)
    keyIndex.set(key, xfs.length - 1)
  }
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : '') +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
    `<fills count="${fills.length}">${fills.join('')}</fills>` +
    `<borders count="${borders.length}">${borders.join('')}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  return { xml, index: (s) => (s ? keyIndex.get(JSON.stringify(s)) ?? 0 : 0) }
}

function sheetXml(sheet: XSheet, index: (s: XStyle | undefined) => number): string {
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((c, i) => {
          if (!c) return ''
          const ref = `${colName(i)}${r + 1}`
          const s = index(c.style)
          const sAttr = s ? ` s="${s}"` : ''
          if (c.v === null || c.v === '') return s ? `<c r="${ref}"${sAttr}/>` : ''
          if (c.date && typeof c.v === 'string') return `<c r="${ref}"${sAttr}><v>${excelDay(c.v)}</v></c>`
          if (typeof c.v === 'number') return `<c r="${ref}"${sAttr}><v>${c.v}</v></c>`
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`
        })
        .join('')
      const h = sheet.heights?.[r]
      return `<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells}</row>`
    })
    .join('')
  const f = sheet.freeze
  const pane = f && (f.rows || f.cols)
    ? `<pane${f.cols ? ` xSplit="${f.cols}"` : ''}${f.rows ? ` ySplit="${f.rows}"` : ''} topLeftCell="${colName(f.cols)}${f.rows + 1}" activePane="${f.rows && f.cols ? 'bottomRight' : f.rows ? 'bottomLeft' : 'topRight'}" state="frozen"/>`
    : ''
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    cols +
    `<sheetData>${rows}</sheetData>` +
    merges +
    `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${sheet.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    `</worksheet>`
  )
}

/** The workbook as a file. */
export async function buildStyledXlsx(sheet: XSheet): Promise<Buffer> {
  const used = sheet.rows.flat().flatMap((c) => (c?.style ? [c.style] : []))
  const styles = stylesOf(used)
  const name = esc(sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  )
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  )
  zip.file('xl/styles.xml', styles.xml)
  zip.file('xl/worksheets/sheet1.xml', sheetXml(sheet, styles.index))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
