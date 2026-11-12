import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { renderPdfBuffer } from '@/lib/export/pdf'
import { QuotePdf } from './quote-pdf'
import type { QuoteCore } from './quotes'

// 2026-11-12 — a quotation's client PDF (docs/design_handoff_product_builder/ › the client quotation), rendered for real
// and read back: HOUZS Marketing, its number, Prepared for · Date · Valid until, each line (est. delivery, what it
// includes, its remark, its term, its amount), Subtotal · Discount · Total, the notes — and no cost or margin anywhere.

const quote: QuoteCore & { no: string } = {
  no: 'QT-2611-003', sub: 's', other: false, client: 'Carres', contact: 'Kelvin', date: '2026-11-10', valid: 30, discount: 5,
  note: 'Payment: 50% on confirmation, 50% on delivery.',
  lines: [
    { key: 'a', kind: 'package', product: 'p', name: 'Social Media Package A', code: 'PRD-26001', pkind: 'recurring', version: 3, list: 4800, cost: 3100,
      months: 6, price: null, eta: '2026-12-15', remark: '',
      items: [{ name: 'Image post', group: 'Graphic design', base: 8, qty: 10, unit: 150 }, { name: 'Reels video', group: 'Video', base: 2, qty: 2, unit: 900 }] },
    { key: 'b', kind: 'item', item: 'i', name: 'Product photo shoot', cat: 'Photography', list: 400, cost: 150, days: 4, qty: 3, price: null,
      eta: '2026-11-16', remark: 'Client provides the products' },
  ],
}

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
  // A non-breaking space ("RM 5,100" kept together) reads as a space.
  return lines.map(l => l.replace(/ /g, ' '))
}

describe("a quotation's client PDF", () => {
  it('is a real PDF with the quotation as the client reads it', async () => {
    // A line the PDF wraps reads back as its pieces: read them as one.
    const text = (await words(<QuotePdf quote={quote} />)).join(' ').replace(/\s+/g, ' ')
    for (const w of ['HOUZS Marketing', 'Quotation', 'QT-2611-003', 'Prepared for', 'Carres', 'Attn: Kelvin', '10/11/2026', '10/12/2026',
      'Social Media Package A', 'Est. delivery 15/12/2026', '10 image post + 2 reels video per month', '6 months × RM 5,100', 'RM 30,600',
      'Product photo shoot', 'Client provides the products', '3 × RM 400', 'RM 1,200', 'Subtotal', 'RM 31,800', 'Discount 5', 'RM 1,590',
      'Total', 'RM 30,210', 'Payment: 50% on confirmation, 50% on delivery.']) {
      expect(text, w).toContain(w)
    }
  }, 30000)

  it('carries no cost or margin anywhere', async () => {
    const text = (await words(<QuotePdf quote={quote} />)).join('\n')
    for (const w of ['Cost', 'cost', 'Margin', 'Profit', '3,100', '3100', 'We make']) expect(text).not.toContain(w)
  }, 30000)
})
