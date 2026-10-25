import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { renderPdfBuffer } from '@/lib/export/pdf'
import { AdsReportPdf, type AdsPdfProps } from './ads-pdf'

// 2026-10-25 — ⑤-3e: an Ads report's PDF (the user, asked whether the report should give a PDF: "can do"), rendered for
// real and read back: the project, its days, each figure against the targets it was published with, its note — the PIC
// Link's report cards on paper; never who published it.

const props: AdsPdfProps = {
  sub: 'Carres', title: 'Raya ads', track: 'TSK-CAR-2610-001', every: '2w', figures: ['spendToDate', 'cpl', 'appt', 'roas'],
  report: {
    no: 2, from: '2026-10-20', until: '2026-11-02',
    values: { roas: 2.7, spendToDate: 3240.4, cpl: 18.4, appt: 46, apptRate: 26.1, leads: 176 },
    targets: { budget: 6000, cpl: 20, roas: 3, apptRate: 25 },
    note: 'Google ads added by hand — 2 ads paused 😀',
  },
  published: '3 Nov 2026',
}

/** Each line of text the PDF draws, read back from its page streams (as audit-pdf.test.tsx reads its own). */
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

describe('an Ads report’s PDF', () => {
  it('the project and its days, then each figure against its target in the setup’s order, then its note', async () => {
    // A line may come in more than one run ("3 " · "Nov 2026"): read them run after run.
    const all = (await words(<AdsReportPdf {...props} />)).join('')
    const order = ['HOUZS Marketing · Ads report', 'Report #2', 'Raya ads · 20 Oct – 2 Nov 2026', 'Project', 'Carres', 'TSK-CAR-2610-001', 'Every 2 weeks',
      'Published', '3 Nov 2026', 'Spend so far', 'RM 3,240', 'of RM 6,000 budget', 'Cost per lead', 'RM 18.40', 'Target RM 20 · on target',
      'Appointments', '46', 'Appointment rate 26.1%', 'ROAS', '2.7', 'Min 3.0 · below',
      // A figure published but since taken off the setup: last.
      'Appointment rate', 'Leads', '176', 'NOTE', 'Google ads added by hand — 2 ads paused ?']
    let at = -1
    for (const w of order) {
      const next = all.indexOf(w, at + 1)
      expect(next, w).toBeGreaterThan(at)
      at = next
    }
    expect(all).toContain('Page 1 of 1')
    // Never who published it.
    expect(all).not.toMatch(/Wei Lun|Published by/)
  })

  it('no note, no figures: neither drawn', async () => {
    const all = (await words(<AdsReportPdf {...props} report={{ ...props.report, values: {}, note: null }} />)).join('')
    expect(all).toContain('No figures in this report.')
    expect(all).not.toContain('NOTE')
  })
})
