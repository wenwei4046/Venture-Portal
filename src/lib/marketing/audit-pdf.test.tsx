import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { renderPdfBuffer } from '@/lib/export/pdf'
import { auditRows, projectLogFromRow } from './audit'
import { AuditDocPdf, AuditTablePdf, type AuditPdfProps } from './audit-pdf'

// 2026-10-25 — ④-3b: the formal log's two PDFs (the user's answer 21, "both"), rendered for real and read back: the
// formal document — the project, the filter, who and when, every record in full, a correction with its record — and the
// table as the screen draws it; their words in what Helvetica draws (an arrow as ->).

const log = projectLogFromRow({
  track: 'TSK-CAR-2610-001', title: 'Price update', kind: 'quick',
  rows: [
    { id: 1, at: '2026-10-20T02:02:00Z', actor: 'SIA', action: 'created', data: { kind: 'quick' } },
    { id: 2, at: '2026-10-21T09:45:00Z', actor: 'Mei', action: 'submitted', stage: 0, stageName: 'First draft', fromTo: 'SIA', version: 'v1' },
    { id: 3, at: '2026-10-22T01:10:00Z', actor: 'SIA', action: 'correction', stage: 0, stageName: 'First draft', reason: 'Sent at 18:45 — the scan 😀', corrects: 2 },
  ],
})!
const props: AuditPdfProps = {
  log, rows: auditRows(log), total: 3, filter: ['Stage: First draft'], by: 'Mei Ling', at: '2026-10-25 09:30',
  whole: at => at.slice(0, 16).replace('T', ' '),
}

/** Each line of text the PDF draws, read back from its page streams: a BT…ET block's `[<hex> kern <hex>] TJ` runs, in
 * Helvetica's WinAnsi. (pdf2json, the export tests' reader, refuses one of these two files — its XRef reading, not the
 * file: a PDF reader opens both.) */
async function words(el: React.ReactElement): Promise<string[]> {
  const buf = await renderPdfBuffer(el)
  expect(buf.subarray(0, 4).toString()).toBe('%PDF')
  const pdf = buf.toString('latin1')
  const ansi = new TextDecoder('windows-1252')
  const lines: string[] = []
  for (const m of pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body: string
    try {
      body = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')
    } catch {
      continue
    }
    for (const block of body.split('BT').slice(1)) {
      const runs = [...block.split('ET')[0].matchAll(/<([0-9a-fA-F]*)>/g)].map(x => ansi.decode(Buffer.from(x[1], 'hex')))
      if (runs.length) lines.push(runs.join(''))
    }
  }
  return lines
}

describe('the formal log’s PDFs', () => {
  it('the formal document: the project, the filter, who and when — every record in full, a correction with its record', async () => {
    // A line may come in more than one run ("3 " · "of 3"): read them run after run.
    const text = (await words(<AuditDocPdf {...props} />)).join('')
    for (const want of ['Audit trail — TSK-CAR-2610-001', 'Price update', 'Stage: First draft', 'Mei Ling', '2026-10-25 09:30', '3 of 3',
      '#2', 'Submitted', 'Mei -> SIA', 'First draft v1', 'Corrected in #3', '#3', 'Correction (correction of #2)', 'Sent at 18:45 — the scan ?', 'Page 1 of 1']) {
      expect(text).toContain(want)
    }
    expect(text).not.toContain('→')
  })

  it('the table: the screen’s columns, a correction’s line under its action', async () => {
    const text = (await words(<AuditTablePdf {...props} />)).join('')
    for (const want of ['TSK-CAR-2610-001 — Price update', '3 of 3 records', 'FROM -> TO', 'Mei -> SIA', 'correction of #2', '2026-10-21 09:45', 'Page 1 of 1']) {
      expect(text).toContain(want)
    }
  })
})
